package main

import (
	"context"
	"fmt"
	"image/color"
	"runtime/debug"
	"strconv"
	"time"

	"gioui.org/app"
	"gioui.org/io/system"
	"gioui.org/layout"
	"gioui.org/op"
	"gioui.org/unit"
	"gioui.org/widget"
	"gioui.org/widget/material"

	"gitdeck/internal/github"
	"gitdeck/internal/gitx"
	"gitdeck/internal/repos"
)

const (
	panelW = 400
	panelH = 540
)

// panelLoop owns the panel window. The window is created when asked for and
// destroyed when closed, rather than kept hidden: a live window holds a GPU
// context, and idling at zero is the entire reason this binary exists.
func panelLoop(ctx context.Context, s *state) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-s.quit:
			return
		case <-s.showPanel:
			// A fresh look should show fresh state.
			s.askRefresh()
			runPanel(ctx, s)

			// Closing the panel tears down its GPU context and font atlas, but
			// Go holds the freed pages by default. This process is about to go
			// back to sleep for a long time, so hand them back.
			debug.FreeOSMemory()
		}
	}
}

func runPanel(ctx context.Context, s *state) {
	w := new(app.Window)
	w.Option(
		// Deliberately not "GitDeck": the full window uses that title, and the
		// launcher finds an already-running window by title. Sharing one would
		// make the panel look like the window it is trying to open.
		app.Title(panelTitle),
		app.Size(unit.Dp(panelW), unit.Dp(panelH)),
		app.MinSize(unit.Dp(320), unit.Dp(300)),
		app.Decorated(false),
	)

	ui := newPanelUI(s, w)

	// Repaint on a slow tick so counts stay current while the panel is open
	// without the poller needing to know a window exists.
	stop := make(chan struct{})
	defer close(stop)
	go func() {
		t := time.NewTicker(2 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-stop:
				return
			case <-t.C:
				w.Invalidate()
			}
		}
	}()

	var ops op.Ops
	for {
		switch e := w.Event().(type) {
		case app.DestroyEvent:
			return
		case app.FrameEvent:
			gtx := app.NewContext(&ops, e)
			ui.layout(ctx, gtx)
			e.Frame(gtx.Ops)
		}
	}
}

// rowWidgets is the click state for one row, kept across frames.
type rowWidgets struct {
	action widget.Clickable
	open   widget.Clickable
}

type panelUI struct {
	s  *state
	w  *app.Window
	th *material.Theme

	list layout.List

	refresh  widget.Clickable
	openFull widget.Clickable
	closeBtn widget.Clickable
	syncAll  widget.Clickable
	rows     map[string]*rowWidgets
}

func newPanelUI(s *state, w *app.Window) *panelUI {
	return &panelUI{
		s:    s,
		w:    w,
		th:   newTheme(),
		list: layout.List{Axis: layout.Vertical},
		rows: map[string]*rowWidgets{},
	}
}

func (p *panelUI) rowFor(path string) *rowWidgets {
	rw, ok := p.rows[path]
	if !ok {
		rw = &rowWidgets{}
		p.rows[path] = rw
	}
	return rw
}

func (p *panelUI) layout(ctx context.Context, gtx layout.Context) layout.Dimensions {
	fill(gtx, colBg)

	// Header actions.
	if p.refresh.Clicked(gtx) {
		p.s.askRefresh()
	}
	if p.openFull.Clicked(gtx) {
		// The full window replaces the panel rather than sitting behind it.
		p.s.openWindow()
		p.close()
	}
	if p.closeBtn.Clicked(gtx) {
		p.close()
	}
	if p.syncAll.Clicked(gtx) {
		go p.s.runOpAll(ctx, "sync")
	}

	watched := p.s.watched()

	return layout.Flex{Axis: layout.Vertical}.Layout(gtx,
		layout.Rigid(func(gtx layout.Context) layout.Dimensions { return p.header(gtx) }),
		layout.Rigid(rule),
		layout.Flexed(1, func(gtx layout.Context) layout.Dimensions {
			return p.body(ctx, gtx, watched)
		}),
		layout.Rigid(rule),
		layout.Rigid(func(gtx layout.Context) layout.Dimensions {
			return p.footer(gtx, watched)
		}),
	)
}

func (p *panelUI) close() {
	p.w.Perform(system.ActionClose)
}

func (p *panelUI) header(gtx layout.Context) layout.Dimensions {
	_, health, busy := p.s.snapshot()

	return layout.Inset{
		Top: unit.Dp(6), Bottom: unit.Dp(6), Left: unit.Dp(10), Right: unit.Dp(6),
	}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
		return layout.Flex{Axis: layout.Horizontal, Alignment: layout.Middle}.Layout(gtx,
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				l := material.Label(p.th, unit.Sp(13), "GitDeck")
				l.Color = colInk
				l.Font.Weight = 600
				return l.Layout(gtx)
			}),
			layout.Rigid(layout.Spacer{Width: unit.Dp(8)}.Layout),
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				return dot(gtx, healthColour(health))
			}),
			layout.Rigid(layout.Spacer{Width: unit.Dp(5)}.Layout),
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				l := material.Label(p.th, unit.Sp(10.5), p.scopeLabel())
				l.Color = colInkFaint
				l.MaxLines = 1
				return l.Layout(gtx)
			}),
			layout.Flexed(1, layout.Spacer{}.Layout),
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				label := "refresh"
				if busy {
					label = "working"
				}
				return p.smallButton(gtx, &p.refresh, label, colInkFaint)
			}),
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				return p.smallButton(gtx, &p.openFull, "open", colInkFaint)
			}),
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				return p.smallButton(gtx, &p.closeBtn, "close", colInkFaint)
			}),
		)
	})
}

func (p *panelUI) scopeLabel() string {
	s := p.s.settings()
	switch s.WatchMode {
	case "group":
		if s.WatchGroup != "" {
			return s.WatchGroup
		}
		return "group"
	case "picked":
		return strconv.Itoa(len(s.WatchPaths)) + " picked"
	default:
		return "all repositories"
	}
}

// flatRow is a repository or one of its worktrees, already flattened for the
// list so scrolling does not have to reason about nesting.
type flatRow struct {
	name   string
	path   string
	status gitx.Status
	nested bool
	last   bool
}

func flatten(views []repos.View) []flatRow {
	var out []flatRow
	for _, v := range views {
		out = append(out, flatRow{name: v.Name, path: v.Path, status: v.Status})
		for i, wt := range v.Worktrees {
			out = append(out, flatRow{
				name:   wt.Name,
				path:   wt.Path,
				status: wt,
				nested: true,
				last:   i == len(v.Worktrees)-1,
			})
		}
	}
	return out
}

func (p *panelUI) body(ctx context.Context, gtx layout.Context, views []repos.View) layout.Dimensions {
	rows := flatten(views)
	if len(rows) == 0 {
		return layout.Center.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
			l := material.Label(p.th, unit.Sp(12), "Nothing being watched.")
			l.Color = colInkFaint
			return l.Layout(gtx)
		})
	}

	return p.list.Layout(gtx, len(rows), func(gtx layout.Context, i int) layout.Dimensions {
		return p.row(ctx, gtx, rows[i])
	})
}

func (p *panelUI) row(ctx context.Context, gtx layout.Context, r flatRow) layout.Dimensions {
	rw := p.rowFor(r.path)

	if rw.action.Clicked(gtx) {
		op := primaryOp(r.status)
		if op != "" {
			go p.s.runOp(ctx, r.path, op)
		}
	}

	left := unit.Dp(8)
	if r.nested {
		left = unit.Dp(24)
	}

	return material.Clickable(gtx, &rw.open, func(gtx layout.Context) layout.Dimensions {
		// A worktree hangs off a rail so it reads as belonging to the row above,
		// the same way the full window draws it.
		return layout.Stack{}.Layout(gtx,
			layout.Expanded(func(gtx layout.Context) layout.Dimensions {
				if !r.nested {
					return layout.Dimensions{}
				}
				railX := gtx.Dp(unit.Dp(13))
				elbowY := gtx.Constraints.Min.Y / 2
				w := gtx.Dp(unit.Dp(1))
				if w < 1 {
					w = 1
				}
				railH := gtx.Constraints.Min.Y
				if r.last {
					railH = elbowY
				}
				bar(gtx.Ops, railX, 0, w, railH, colLine)
				bar(gtx.Ops, railX, elbowY, gtx.Dp(unit.Dp(7)), w, colLine)
				return layout.Dimensions{Size: gtx.Constraints.Min}
			}),
			layout.Stacked(func(gtx layout.Context) layout.Dimensions {
				return p.rowBody(gtx, r, rw, left)
			}),
		)
	})
}

func (p *panelUI) rowBody(gtx layout.Context, r flatRow, rw *rowWidgets, left unit.Dp) layout.Dimensions {
	{
		return layout.Inset{
			Top: unit.Dp(4), Bottom: unit.Dp(4), Left: left, Right: unit.Dp(6),
		}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
			return layout.Flex{Axis: layout.Horizontal, Alignment: layout.Middle}.Layout(gtx,
				layout.Rigid(func(gtx layout.Context) layout.Dimensions {
					return dot(gtx, statusColour(r.status))
				}),
				layout.Rigid(layout.Spacer{Width: unit.Dp(7)}.Layout),
				layout.Rigid(func(gtx layout.Context) layout.Dimensions {
					l := material.Label(p.th, unit.Sp(12), r.name)
					l.Color = colInk
					if r.nested {
						l.Color = colInkSoft
					}
					l.MaxLines = 1
					return l.Layout(gtx)
				}),
				layout.Rigid(layout.Spacer{Width: unit.Dp(6)}.Layout),
				layout.Flexed(1, func(gtx layout.Context) layout.Dimensions {
					l := material.Label(p.th, unit.Sp(10.5), r.status.Branch)
					l.Color = colInkFaint
					l.MaxLines = 1
					return l.Layout(gtx)
				}),
				layout.Rigid(func(gtx layout.Context) layout.Dimensions {
					return p.counters(gtx, r.status)
				}),
				layout.Rigid(func(gtx layout.Context) layout.Dimensions {
					label := primaryLabel(r.status)
					if label == "" {
						return layout.Dimensions{}
					}
					return p.smallButton(gtx, &rw.action, label, colAccent)
				}),
			)
		})
	}
}

func (p *panelUI) counters(gtx layout.Context, st gitx.Status) layout.Dimensions {
	type pill struct {
		text string
		col  color.NRGBA
	}
	var pills []pill

	if d := st.Staged + st.Unstaged + st.Untracked; d > 0 {
		pills = append(pills, pill{strconv.Itoa(d), colDirty})
	}
	if st.Behind > 0 {
		pills = append(pills, pill{"v" + strconv.Itoa(st.Behind), colBehind})
	}
	if st.Ahead > 0 {
		pills = append(pills, pill{"^" + strconv.Itoa(st.Ahead), colAhead})
	}
	if len(pills) == 0 {
		return layout.Dimensions{}
	}

	children := make([]layout.FlexChild, 0, len(pills))
	for _, pl := range pills {
		pl := pl
		children = append(children, layout.Rigid(func(gtx layout.Context) layout.Dimensions {
			return layout.Inset{Right: unit.Dp(4)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
				l := material.Label(p.th, unit.Sp(10), pl.text)
				l.Color = pl.col
				return l.Layout(gtx)
			})
		}))
	}
	return layout.Flex{Axis: layout.Horizontal, Alignment: layout.Middle}.Layout(gtx, children...)
}

func (p *panelUI) footer(gtx layout.Context, views []repos.View) layout.Dimensions {
	c := repos.Summarise(views)

	return layout.Inset{
		Top: unit.Dp(5), Bottom: unit.Dp(5), Left: unit.Dp(10), Right: unit.Dp(6),
	}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
		return layout.Flex{Axis: layout.Horizontal, Alignment: layout.Middle}.Layout(gtx,
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				l := material.Label(p.th, unit.Sp(10.5),
					fmt.Sprintf("%d watched", c.Rows))
				l.Color = colInkFaint
				return l.Layout(gtx)
			}),
			layout.Rigid(layout.Spacer{Width: unit.Dp(8)}.Layout),
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				if c.Unpushed == 0 {
					return layout.Dimensions{}
				}
				l := material.Label(p.th, unit.Sp(10.5), strconv.Itoa(c.Unpushed)+" to push")
				l.Color = colAhead
				return l.Layout(gtx)
			}),
			layout.Rigid(layout.Spacer{Width: unit.Dp(8)}.Layout),
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				if c.Dirty == 0 {
					return layout.Dimensions{}
				}
				l := material.Label(p.th, unit.Sp(10.5), strconv.Itoa(c.Dirty)+" dirty")
				l.Color = colDirty
				return l.Layout(gtx)
			}),
			layout.Flexed(1, layout.Spacer{}.Layout),
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				return p.smallButton(gtx, &p.syncAll, "sync watched", colInkSoft)
			}),
		)
	})
}

// smallButton is a compact text button with a hover background.
func (p *panelUI) smallButton(gtx layout.Context, click *widget.Clickable, label string, col color.NRGBA) layout.Dimensions {
	return layout.Inset{Left: unit.Dp(3)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
		return material.Clickable(gtx, click, func(gtx layout.Context) layout.Dimensions {
			return layout.Inset{
				Top: unit.Dp(3), Bottom: unit.Dp(3), Left: unit.Dp(6), Right: unit.Dp(6),
			}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
				l := material.Label(p.th, unit.Sp(10.5), label)
				l.Color = col
				l.MaxLines = 1
				return l.Layout(gtx)
			})
		})
	})
}

// primaryOp mirrors the web UI: the button offers whatever that repository
// actually needs right now.
func primaryOp(st gitx.Status) string {
	if st.Error != "" || !st.HasRemote {
		return ""
	}
	switch {
	case st.Upstream == "":
		return "publish"
	case st.Ahead > 0 && st.Behind > 0:
		return "sync"
	case st.Behind > 0:
		return "pull"
	case st.Ahead > 0:
		return "push"
	default:
		return "sync"
	}
}

func primaryLabel(st gitx.Status) string {
	switch primaryOp(st) {
	case "publish":
		return "publish"
	case "sync":
		return "sync"
	case "pull":
		return "pull"
	case "push":
		return "push"
	}
	return ""
}

func statusColour(st gitx.Status) color.NRGBA {
	switch {
	case st.Error != "" || st.Conflicted > 0:
		return colConflict
	case st.Staged+st.Unstaged+st.Untracked > 0:
		return colDirty
	case st.Behind > 0:
		return colBehind
	case st.Ahead > 0:
		return colAhead
	default:
		return colClean
	}
}

// healthColour turns the GitHub probe into the dot beside the title, using the
// same three states the web UI shows.
func healthColour(h github.Health) color.NRGBA {
	switch h.State {
	case github.StateConnected:
		return colClean
	case github.StateDegraded, github.StateNoCLI:
		return colBehind
	case github.StateOffline, github.StateNoAuth:
		return colConflict
	default:
		return colInkFaint
	}
}
