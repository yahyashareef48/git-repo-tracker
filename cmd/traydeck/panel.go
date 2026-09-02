package main

import (
	"context"
	"image"
	"image/color"
	"runtime/debug"
	"strconv"
	"time"

	"gioui.org/app"
	"gioui.org/io/system"
	"gioui.org/layout"
	"gioui.org/op"
	"gioui.org/op/clip"
	"gioui.org/unit"
	"gioui.org/widget"
	"gioui.org/widget/material"

	"gitdeck/internal/github"
	"gitdeck/internal/gitx"
	"gitdeck/internal/repos"
	"gitdeck/internal/store"
)

// The panel is a square widget sized from the screen, see screen.go. Rows and
// the scope picker scroll inside it, so the window never resizes itself while
// you are looking at it.

// panelLoop owns the panel window. The window is created when asked for and
// destroyed when closed, rather than kept hidden: a live window holds a GPU
// context, and idling cheaply is the entire reason this binary exists.
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

			// Closing tears down the GPU context and font atlas, but Go holds
			// the freed pages by default. This process is about to go back to
			// sleep for a long time, so hand them back.
			debug.FreeOSMemory()
		}
	}
}

func runPanel(ctx context.Context, s *state) {
	w := new(app.Window)
	ui := newPanelUI(s, w)
	ui.scopeOpen = s.startScopeOpen

	// An opening guess, corrected on the first frame once Gio reports the
	// scale of the monitor the window actually landed on.
	side := squareDp(primaryWidthPx(), guessScale())

	w.Option(
		// Deliberately not "GitDeck": the full window uses that title, and the
		// launcher finds an already-running window by title. Sharing one would
		// make the panel look like the window it is trying to open.
		app.Title(panelTitle),
		app.Size(side, side),
		app.MinSize(side, side),
		app.Decorated(false),
	)

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
		case app.Win32ViewEvent:
			// Gio hands over the HWND once the window exists, which is the
			// only way to reach the Windows calls it does not wrap.
			ui.hwnd = e.HWND
			makeWidget(ui.hwnd)
		case app.FrameEvent:
			gtx := app.NewContext(&ops, e)
			ui.layout(ctx, gtx)
			e.Frame(gtx.Ops)
			ui.sizeOnce(gtx)
		}
	}
}

// rowWidgets is the click state for one row, kept across frames.
type rowWidgets struct {
	action widget.Clickable
	open   widget.Clickable
}

// scopeWidgets is the click state for one entry in the scope picker.
type scopeWidgets struct {
	click widget.Clickable
}

type panelUI struct {
	s  *state
	w  *app.Window
	th *material.Theme

	list      layout.List
	scopeList layout.List

	refresh  widget.Clickable
	openFull widget.Clickable
	closeBtn widget.Clickable
	syncAll  widget.Clickable
	scopeBtn widget.Clickable

	rows   map[string]*rowWidgets
	scopes map[string]*scopeWidgets

	// scopeOpen shows the watch picker in place of the repository list.
	scopeOpen bool

	// sized guards the one resize to the real scale, so the window is not
	// asked to resize on every frame.
	sized bool

	// hwnd is the window handle, once Windows has made one.
	hwnd uintptr
}

func newPanelUI(s *state, w *app.Window) *panelUI {
	return &panelUI{
		s:         s,
		w:         w,
		th:        newTheme(),
		list:      layout.List{Axis: layout.Vertical},
		scopeList: layout.List{Axis: layout.Vertical},
		rows:      map[string]*rowWidgets{},
		scopes:    map[string]*scopeWidgets{},
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

func (p *panelUI) scopeFor(key string) *scopeWidgets {
	sw, ok := p.scopes[key]
	if !ok {
		sw = &scopeWidgets{}
		p.scopes[key] = sw
	}
	return sw
}

// sizeOnce squares the window to a sixth of the screen using Gio's own scale,
// which is only known once a frame has been drawn.
func (p *panelUI) sizeOnce(gtx layout.Context) {
	if p.sized {
		return
	}
	p.sized = true
	side := squareDp(primaryWidthPx(), gtx.Metric.PxPerDp)
	p.w.Option(app.Size(side, side), app.MinSize(side, side))

	// Resizing can drop the window out of the topmost band, so say it again.
	pinOnTop(p.hwnd)
}

func (p *panelUI) layout(ctx context.Context, gtx layout.Context) layout.Dimensions {
	fill(gtx, colBg)

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
	if p.scopeBtn.Clicked(gtx) {
		p.scopeOpen = !p.scopeOpen
	}

	return layout.Flex{Axis: layout.Vertical}.Layout(gtx,
		layout.Rigid(p.header),
		layout.Rigid(rule),
		layout.Flexed(1, func(gtx layout.Context) layout.Dimensions {
			if p.scopeOpen {
				return p.scopePicker(gtx)
			}
			return p.body(ctx, gtx)
		}),
		layout.Rigid(rule),
		layout.Rigid(p.footer),
	)
}

func (p *panelUI) close() {
	p.w.Perform(system.ActionClose)
}

// header carries the title, the watch scope and the window buttons. The strip
// is also the drag handle: the window is undecorated, so without this there is
// no way to move it.
func (p *panelUI) header(gtx layout.Context) layout.Dimensions {
	_, health, busy := p.s.snapshot()

	return layout.Inset{
		Top: unit.Dp(5), Bottom: unit.Dp(5), Left: unit.Dp(9), Right: unit.Dp(4),
	}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
		return layout.Flex{Axis: layout.Horizontal, Alignment: layout.Middle}.Layout(gtx,
			// The title and the gap after the scope are the drag handles. The
			// buttons deliberately are not: a move area answers WM_NCHITTEST
			// with HTCAPTION, and Windows then swallows the click before the
			// app ever sees it, so anything clickable must sit outside one.
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				return p.dragZone(gtx, func(gtx layout.Context) layout.Dimensions {
					return layout.Flex{Axis: layout.Horizontal, Alignment: layout.Middle}.Layout(gtx,
						layout.Rigid(func(gtx layout.Context) layout.Dimensions {
							l := material.Label(p.th, unit.Sp(12.5), "GitDeck")
							l.Color = colInk
							l.Font.Weight = 600
							return l.Layout(gtx)
						}),
						layout.Rigid(layout.Spacer{Width: unit.Dp(7)}.Layout),
						layout.Rigid(func(gtx layout.Context) layout.Dimensions {
							return dot(gtx, healthColour(health))
						}),
						layout.Rigid(layout.Spacer{Width: unit.Dp(5)}.Layout),
					)
				})
			}),
			layout.Rigid(p.scopeButton),
			layout.Flexed(1, func(gtx layout.Context) layout.Dimensions {
				return p.dragZone(gtx, func(gtx layout.Context) layout.Dimensions {
					// A flexed child's cross-axis minimum is zero, so taking
					// Constraints.Min here would give the drag area no height
					// and nothing to hit.
					return layout.Dimensions{
						Size: image.Pt(gtx.Constraints.Min.X, gtx.Dp(unit.Dp(18))),
					}
				})
			}),
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				col := colInkFaint
				label := "refresh"
				if busy {
					col = colAccent
					label = "working"
				}
				return p.textButton(gtx, &p.refresh, label, col)
			}),
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				return p.textButton(gtx, &p.openFull, "open", colInkFaint)
			}),
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				return p.textButton(gtx, &p.closeBtn, "close", colInkFaint)
			}),
		)
	})
}

// dragZone marks a widget's area as somewhere the window can be dragged from.
func (p *panelUI) dragZone(gtx layout.Context, w layout.Widget) layout.Dimensions {
	dims := w(gtx)
	defer clip.Rect{Max: dims.Size}.Push(gtx.Ops).Pop()
	system.ActionInputOp(system.ActionMove).Add(gtx.Ops)
	return dims
}

// scopeButton opens the watch picker.
func (p *panelUI) scopeButton(gtx layout.Context) layout.Dimensions {
	return material.Clickable(gtx, &p.scopeBtn, func(gtx layout.Context) layout.Dimensions {
		return layout.Inset{
			Top: unit.Dp(2), Bottom: unit.Dp(2), Left: unit.Dp(3), Right: unit.Dp(3),
		}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
			l := material.Label(p.th, unit.Sp(10), "watching: "+p.scopeLabel())
			l.Color = colInkFaint
			l.MaxLines = 1
			return l.Layout(gtx)
		})
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
		return "all"
	}
}

// scopeEntry is one line of the watch picker.
type scopeEntry struct {
	key    string
	label  string
	hint   string
	active bool
	// next is the settings to save when this entry is chosen. Keeping the
	// outcome as data rather than a closure makes the whole picker testable
	// without a window.
	next store.Settings
	// keepOpen is true for entries that are part of a multi-step choice.
	keepOpen bool
}

// buildScopeEntries lists what the panel can watch: everything, each group,
// then each repository as an individually tickable option.
func buildScopeEntries(all []repos.View, set store.Settings) []scopeEntry {
	groups := map[string]int{}
	var order []string
	for _, v := range all {
		if v.Group == "" {
			continue
		}
		if _, seen := groups[v.Group]; !seen {
			order = append(order, v.Group)
		}
		groups[v.Group]++
	}

	withMode := func(mode, group string, paths []string) store.Settings {
		out := set
		out.WatchMode = mode
		out.WatchGroup = group
		out.WatchPaths = paths
		return out
	}

	entries := []scopeEntry{{
		key:    "all",
		label:  "All repositories",
		hint:   strconv.Itoa(len(all)),
		active: set.WatchMode == "" || set.WatchMode == "all",
		next:   withMode("all", "", set.WatchPaths),
	}}

	for _, g := range order {
		entries = append(entries, scopeEntry{
			key:    "g:" + g,
			label:  g,
			hint:   strconv.Itoa(groups[g]),
			active: set.WatchMode == "group" && set.WatchGroup == g,
			next:   withMode("group", g, set.WatchPaths),
		})
	}

	picked := map[string]bool{}
	for _, path := range set.WatchPaths {
		picked[path] = true
	}
	for _, v := range all {
		// Ticking a repository switches to a hand-picked set and toggles that
		// one, so the picker behaves like a row of checkboxes.
		next := make([]string, 0, len(set.WatchPaths)+1)
		for _, path := range set.WatchPaths {
			if path != v.Path {
				next = append(next, path)
			}
		}
		if !picked[v.Path] {
			next = append(next, v.Path)
		}
		entries = append(entries, scopeEntry{
			key:      "r:" + v.Path,
			label:    v.Name,
			hint:     v.Group,
			active:   set.WatchMode == "picked" && picked[v.Path],
			next:     withMode("picked", "", next),
			keepOpen: true,
		})
	}
	return entries
}

func (p *panelUI) scopeEntries() []scopeEntry {
	all, _, _ := p.s.snapshot()
	return buildScopeEntries(all, p.s.settings())
}

func (p *panelUI) applyScope(e scopeEntry) {
	if err := p.s.store.SaveSettings(e.next); err != nil {
		return
	}
	if !e.keepOpen {
		p.scopeOpen = false
	}
}

func (p *panelUI) scopePicker(gtx layout.Context) layout.Dimensions {
	entries := p.scopeEntries()
	return p.scopeList.Layout(gtx, len(entries), func(gtx layout.Context, i int) layout.Dimensions {
		e := entries[i]
		sw := p.scopeFor(e.key)
		if sw.click.Clicked(gtx) {
			p.applyScope(e)
		}
		return material.Clickable(gtx, &sw.click, func(gtx layout.Context) layout.Dimensions {
			return layout.Inset{
				Top: unit.Dp(3), Bottom: unit.Dp(3), Left: unit.Dp(8), Right: unit.Dp(8),
			}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
				return layout.Flex{Axis: layout.Horizontal, Alignment: layout.Middle}.Layout(gtx,
					layout.Rigid(func(gtx layout.Context) layout.Dimensions {
						mark := "  "
						if e.active {
							mark = "x "
						}
						l := material.Label(p.th, unit.Sp(11), mark)
						l.Color = colAccent
						return l.Layout(gtx)
					}),
					layout.Rigid(layout.Spacer{Width: unit.Dp(5)}.Layout),
					layout.Flexed(1, func(gtx layout.Context) layout.Dimensions {
						l := material.Label(p.th, unit.Sp(11.5), e.label)
						l.Color = colInkSoft
						if e.active {
							l.Color = colInk
						}
						l.MaxLines = 1
						return l.Layout(gtx)
					}),
					layout.Rigid(func(gtx layout.Context) layout.Dimensions {
						if e.hint == "" {
							return layout.Dimensions{}
						}
						l := material.Label(p.th, unit.Sp(10), e.hint)
						l.Color = colInkFaint
						return l.Layout(gtx)
					}),
				)
			})
		})
	})
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

// label is what the row is called: a repository's name, or a worktree's
// branch once the repeated repository name has been dropped.
func (r flatRow) label() string {
	if r.name == "" {
		return r.status.Branch
	}
	return r.name
}

// trailing is the dimmer text after the name, and is empty when the branch
// has already been promoted to the label.
func (r flatRow) trailing() string {
	if r.name == "" {
		return ""
	}
	return r.status.Branch
}

func flatten(views []repos.View) []flatRow {
	var out []flatRow
	for _, v := range views {
		out = append(out, flatRow{name: v.Name, path: v.Path, status: v.Status})
		for i, wt := range v.Worktrees {
			// A worktree already hangs under its repository, so repeating the
			// repository's name on it says nothing. Its branch is the thing
			// that tells one worktree from another, so that becomes its label.
			name := wt.Name
			if name == v.Name {
				name = ""
			}
			out = append(out, flatRow{
				name:   name,
				path:   wt.Path,
				status: wt,
				nested: true,
				last:   i == len(v.Worktrees)-1,
			})
		}
	}
	return out
}

func (p *panelUI) body(ctx context.Context, gtx layout.Context) layout.Dimensions {
	rows := flatten(p.s.watched())
	if len(rows) == 0 {
		return layout.Center.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
			l := material.Label(p.th, unit.Sp(11), "Nothing watched. Pick some from \"watching\" above.")
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
		if op := primaryOp(r.status); op != "" {
			go p.s.runOp(ctx, r.path, op)
		}
	}

	left := unit.Dp(8)
	if r.nested {
		left = unit.Dp(22)
	}

	return material.Clickable(gtx, &rw.open, func(gtx layout.Context) layout.Dimensions {
		// A worktree hangs off a rail so it reads as belonging to the row
		// above, the same way the full window draws it.
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
				bar(gtx.Ops, railX, elbowY, gtx.Dp(unit.Dp(6)), w, colLine)
				return layout.Dimensions{Size: gtx.Constraints.Min}
			}),
			layout.Stacked(func(gtx layout.Context) layout.Dimensions {
				return p.rowBody(gtx, r, rw, left)
			}),
		)
	})
}

func (p *panelUI) rowBody(gtx layout.Context, r flatRow, rw *rowWidgets, left unit.Dp) layout.Dimensions {
	return layout.Inset{
		Top: unit.Dp(3), Bottom: unit.Dp(3), Left: left, Right: unit.Dp(4),
	}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
		return layout.Flex{Axis: layout.Horizontal, Alignment: layout.Middle}.Layout(gtx,
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				return dot(gtx, statusColour(r.status))
			}),
			layout.Rigid(layout.Spacer{Width: unit.Dp(6)}.Layout),
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				l := material.Label(p.th, unit.Sp(11.5), r.label())
				l.Color = colInk
				if r.nested {
					l.Color = colInkSoft
				}
				l.MaxLines = 1
				return l.Layout(gtx)
			}),
			layout.Rigid(layout.Spacer{Width: unit.Dp(5)}.Layout),
			layout.Flexed(1, func(gtx layout.Context) layout.Dimensions {
				l := material.Label(p.th, unit.Sp(10), r.trailing())
				l.Color = colInkFaint
				l.MaxLines = 1
				return l.Layout(gtx)
			}),
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				return p.counters(gtx, r.status)
			}),
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				label := primaryOp(r.status)
				if label == "" {
					return layout.Dimensions{}
				}
				return p.textButton(gtx, &rw.action, label, colAccent)
			}),
		)
	})
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
		pills = append(pills, pill{strconv.Itoa(st.Behind), colBehind})
	}
	if st.Ahead > 0 {
		pills = append(pills, pill{strconv.Itoa(st.Ahead), colAhead})
	}
	if len(pills) == 0 {
		return layout.Dimensions{}
	}

	children := make([]layout.FlexChild, 0, len(pills))
	for _, pl := range pills {
		pl := pl
		children = append(children, layout.Rigid(func(gtx layout.Context) layout.Dimensions {
			return layout.Inset{Right: unit.Dp(3)}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
				l := material.Label(p.th, unit.Sp(9.5), pl.text)
				l.Color = pl.col
				return l.Layout(gtx)
			})
		}))
	}
	return layout.Flex{Axis: layout.Horizontal, Alignment: layout.Middle}.Layout(gtx, children...)
}

func (p *panelUI) footer(gtx layout.Context) layout.Dimensions {
	c := repos.Summarise(p.s.watched())

	return layout.Inset{
		Top: unit.Dp(4), Bottom: unit.Dp(4), Left: unit.Dp(9), Right: unit.Dp(4),
	}.Layout(gtx, func(gtx layout.Context) layout.Dimensions {
		return layout.Flex{Axis: layout.Horizontal, Alignment: layout.Middle}.Layout(gtx,
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				l := material.Label(p.th, unit.Sp(10), strconv.Itoa(c.Rows)+" watched")
				l.Color = colInkFaint
				return l.Layout(gtx)
			}),
			layout.Rigid(layout.Spacer{Width: unit.Dp(7)}.Layout),
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				if c.Unpushed == 0 {
					return layout.Dimensions{}
				}
				l := material.Label(p.th, unit.Sp(10), strconv.Itoa(c.Unpushed)+" to push")
				l.Color = colAhead
				return l.Layout(gtx)
			}),
			layout.Rigid(layout.Spacer{Width: unit.Dp(7)}.Layout),
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				if c.Dirty == 0 {
					return layout.Dimensions{}
				}
				l := material.Label(p.th, unit.Sp(10), strconv.Itoa(c.Dirty)+" dirty")
				l.Color = colDirty
				return l.Layout(gtx)
			}),
			layout.Flexed(1, layout.Spacer{}.Layout),
			layout.Rigid(func(gtx layout.Context) layout.Dimensions {
				return p.textButton(gtx, &p.syncAll, "sync watched", colInkSoft)
			}),
		)
	})
}

// textButton is a compact label with a hover background.
func (p *panelUI) textButton(gtx layout.Context, click *widget.Clickable, label string, col color.NRGBA) layout.Dimensions {
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
