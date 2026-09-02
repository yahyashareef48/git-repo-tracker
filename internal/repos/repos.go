// Package repos turns the tracked repository list into rendered rows.
//
// It exists so the tray binary and the full window read repository state the
// same way. Before the split this lived in the Wails app's main package, which
// meant a second binary could not reach it without duplicating the logic.
package repos

import (
	"context"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"gitdeck/internal/gitx"
	"gitdeck/internal/store"
)

// View is one row of the repo list: the tracked entry, its status, and any
// linked worktrees rendered as children.
type View struct {
	Path      string        `json:"path"`
	Name      string        `json:"name"`
	Pinned    bool          `json:"pinned"`
	Group     string        `json:"group"`
	Status    gitx.Status   `json:"status"`
	Worktrees []gitx.Status `json:"worktrees"`
}

// Counts summarises a list of views for the tray tooltip and badge.
type Counts struct {
	// Repos counts tracked repositories; Rows counts those plus their
	// worktrees, which is what a list actually shows.
	Repos    int
	Rows     int
	Unpushed int
	Dirty    int
	Behind   int
}

// readLimit bounds how many repositories are inspected at once. One git process
// per repo is fine; fifty at once on a laptop is not.
const readLimit = 12

// Build reads one repository and its worktrees.
func Build(ctx context.Context, e store.Entry) View {
	v := View{Path: e.Path, Name: e.Name, Pinned: e.Pinned, Group: e.Group}

	if _, err := os.Stat(e.Path); err != nil {
		v.Status = gitx.Status{Path: e.Path, Name: e.Name, Error: "folder is missing"}
		return v
	}

	v.Status = gitx.GetStatus(ctx, e.Path)
	if v.Status.Name != "" {
		v.Name = v.Status.Name
	}

	for _, wt := range gitx.ListWorktrees(ctx, e.Path) {
		if wt.IsMain || sameDir(wt.Path, e.Path) {
			continue
		}
		if _, err := os.Stat(wt.Path); err != nil {
			continue
		}
		v.Worktrees = append(v.Worktrees, gitx.GetStatus(ctx, wt.Path))
	}
	return v
}

// List reads every tracked repository concurrently, pinned ones first.
func List(ctx context.Context, s *store.Store) []View {
	if s == nil {
		return nil
	}
	entries := s.List()
	views := make([]View, len(entries))

	var wg sync.WaitGroup
	sem := make(chan struct{}, readLimit)

	for i, e := range entries {
		wg.Add(1)
		go func(i int, e store.Entry) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			views[i] = Build(ctx, e)
		}(i, e)
	}
	wg.Wait()

	sort.SliceStable(views, func(i, j int) bool {
		return views[i].Pinned && !views[j].Pinned
	})
	return views
}

// Summarise counts what the tray needs. Worktrees count as separate checkouts,
// because that is exactly what they are: their own branch and their own
// uncommitted work.
func Summarise(views []View) Counts {
	c := Counts{Repos: len(views)}
	for _, v := range views {
		for _, st := range append([]gitx.Status{v.Status}, v.Worktrees...) {
			c.Rows++
			if st.Ahead > 0 || (st.HasRemote && st.Upstream == "") {
				c.Unpushed++
			}
			if st.Dirty() {
				c.Dirty++
			}
			if st.Behind > 0 {
				c.Behind++
			}
		}
	}
	return c
}

// Watched filters views down to what the tray panel should show.
func Watched(views []View, s store.Settings) []View {
	switch s.WatchMode {
	case "group":
		return filter(views, func(v View) bool { return v.Group == s.WatchGroup })
	case "picked":
		picked := make(map[string]bool, len(s.WatchPaths))
		for _, p := range s.WatchPaths {
			picked[normalise(p)] = true
		}
		return filter(views, func(v View) bool { return picked[normalise(v.Path)] })
	default:
		return views
	}
}

func filter(views []View, keep func(View) bool) []View {
	out := make([]View, 0, len(views))
	for _, v := range views {
		if keep(v) {
			out = append(out, v)
		}
	}
	return out
}

func sameDir(a, b string) bool {
	return strings.EqualFold(filepath.Clean(a), filepath.Clean(b))
}

func normalise(p string) string {
	return strings.ToLower(filepath.Clean(p))
}
