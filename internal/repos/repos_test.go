package repos

import (
	"testing"

	"gitdeck/internal/gitx"
	"gitdeck/internal/store"
)

func view(name, group string, st gitx.Status, wts ...gitx.Status) View {
	return View{Path: `C:\repos\` + name, Name: name, Group: group, Status: st, Worktrees: wts}
}

func TestSummariseCountsWorktrees(t *testing.T) {
	views := []View{
		// Clean repo, nothing to report.
		view("clean", "a", gitx.Status{HasRemote: true, Upstream: "origin/main"}),
		// Ahead, and a worktree that is both dirty and ahead.
		view("busy", "a",
			gitx.Status{HasRemote: true, Upstream: "origin/main", Ahead: 2},
			gitx.Status{HasRemote: true, Upstream: "origin/wt", Ahead: 1, Unstaged: 3},
		),
		// Published nowhere: an unpushed branch counts even with no ahead count,
		// because there is no upstream to be ahead of yet.
		view("unpublished", "b", gitx.Status{HasRemote: true, Upstream: ""}),
		// Behind only.
		view("stale", "b", gitx.Status{HasRemote: true, Upstream: "origin/main", Behind: 4}),
	}

	c := Summarise(views)

	if c.Repos != 4 {
		t.Errorf("Repos = %d, want 4", c.Repos)
	}
	// Rows counts worktrees as their own checkouts.
	if c.Rows != 5 {
		t.Errorf("Rows = %d, want 5", c.Rows)
	}
	// busy, busy's worktree, and unpublished.
	if c.Unpushed != 3 {
		t.Errorf("Unpushed = %d, want 3", c.Unpushed)
	}
	if c.Dirty != 1 {
		t.Errorf("Dirty = %d, want 1", c.Dirty)
	}
	if c.Behind != 1 {
		t.Errorf("Behind = %d, want 1", c.Behind)
	}
}

func TestWatched(t *testing.T) {
	views := []View{
		view("one", "work", gitx.Status{}),
		view("two", "work", gitx.Status{}),
		view("three", "personal", gitx.Status{}),
	}

	names := func(vs []View) string {
		out := ""
		for _, v := range vs {
			out += v.Name + " "
		}
		return out
	}

	t.Run("all is the default", func(t *testing.T) {
		if got := Watched(views, store.Settings{WatchMode: "all"}); len(got) != 3 {
			t.Errorf("got %q, want all three", names(got))
		}
		// An unset mode must not hide everything.
		if got := Watched(views, store.Settings{}); len(got) != 3 {
			t.Errorf("empty mode gave %q, want all three", names(got))
		}
	})

	t.Run("group", func(t *testing.T) {
		got := Watched(views, store.Settings{WatchMode: "group", WatchGroup: "work"})
		if names(got) != "one two " {
			t.Errorf("got %q, want \"one two \"", names(got))
		}
	})

	t.Run("picked matches regardless of case or separator", func(t *testing.T) {
		// The window writes paths as the user's store has them; the tray must
		// still match them on Windows, where case and slashes vary.
		got := Watched(views, store.Settings{
			WatchMode:  "picked",
			WatchPaths: []string{`c:\REPOS\one`, `C:/repos/three`},
		})
		if names(got) != "one three " {
			t.Errorf("got %q, want \"one three \"", names(got))
		}
	})

	t.Run("picked with nothing picked shows nothing", func(t *testing.T) {
		if got := Watched(views, store.Settings{WatchMode: "picked"}); len(got) != 0 {
			t.Errorf("got %q, want none", names(got))
		}
	})
}
