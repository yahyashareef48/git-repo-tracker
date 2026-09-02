package main

import (
	"testing"

	"gitdeck/internal/repos"
	"gitdeck/internal/store"
)

func repoView(name, group, path string) repos.View {
	return repos.View{Name: name, Group: group, Path: path}
}

var sample = []repos.View{
	repoView("engine", "work", `C:\r\engine`),
	repoView("agent", "work", `C:\r\agent`),
	repoView("notes", "", `C:\r\notes`),
}

func findEntry(t *testing.T, es []scopeEntry, key string) scopeEntry {
	t.Helper()
	for _, e := range es {
		if e.key == key {
			return e
		}
	}
	t.Fatalf("no entry %q in %d entries", key, len(es))
	return scopeEntry{}
}

func TestScopeEntriesListsEverythingOnce(t *testing.T) {
	es := buildScopeEntries(sample, store.Settings{WatchMode: "all"})

	// All repositories, one group ("work"), and each of the three repos.
	if len(es) != 5 {
		keys := make([]string, len(es))
		for i, e := range es {
			keys[i] = e.key
		}
		t.Fatalf("got %d entries %v, want 5", len(es), keys)
	}
	if !findEntry(t, es, "all").active {
		t.Error(`"all" should be active when WatchMode is "all"`)
	}
	// An ungrouped repo must not invent a group entry.
	for _, e := range es {
		if e.key == "g:" {
			t.Error("ungrouped repositories produced an empty group entry")
		}
	}
}

func TestScopeEntriesUnsetModeCountsAsAll(t *testing.T) {
	// A settings file written before watch scopes existed has no mode; the
	// panel must not show nothing in that case.
	es := buildScopeEntries(sample, store.Settings{})
	if !findEntry(t, es, "all").active {
		t.Error("an empty WatchMode should read as all repositories")
	}
}

func TestScopeGroupEntry(t *testing.T) {
	es := buildScopeEntries(sample, store.Settings{WatchMode: "group", WatchGroup: "work"})

	g := findEntry(t, es, "g:work")
	if !g.active {
		t.Error("the chosen group should be marked active")
	}
	if g.hint != "2" {
		t.Errorf("group hint = %q, want the member count 2", g.hint)
	}
	if g.next.WatchMode != "group" || g.next.WatchGroup != "work" {
		t.Errorf("group entry saves %+v", g.next)
	}
	if g.keepOpen {
		t.Error("choosing a group is one decision, so the picker should close")
	}
}

func TestScopePickingTogglesOneRepo(t *testing.T) {
	set := store.Settings{WatchMode: "picked", WatchPaths: []string{`C:\r\engine`}}
	es := buildScopeEntries(sample, set)

	engine := findEntry(t, es, `r:C:\r\engine`)
	if !engine.active {
		t.Error("an already-picked repo should be marked active")
	}
	// Choosing it again unpicks it.
	if got := engine.next.WatchPaths; len(got) != 0 {
		t.Errorf("unpicking gave %v, want none", got)
	}

	agent := findEntry(t, es, `r:C:\r\agent`)
	if agent.active {
		t.Error("an unpicked repo should not be active")
	}
	// Choosing it adds it to the existing selection rather than replacing it.
	got := agent.next.WatchPaths
	if len(got) != 2 {
		t.Fatalf("picking gave %v, want both paths", got)
	}
	if !agent.keepOpen {
		t.Error("picking repositories is multi-step, so the picker should stay open")
	}
}

func TestScopePickingFromGroupModeStartsFresh(t *testing.T) {
	// Coming from a group, ticking a repository should select just that one,
	// not silently inherit whatever paths were last saved.
	set := store.Settings{
		WatchMode:  "group",
		WatchGroup: "work",
		WatchPaths: nil,
	}
	es := buildScopeEntries(sample, set)
	notes := findEntry(t, es, `r:C:\r\notes`)

	if notes.next.WatchMode != "picked" {
		t.Errorf("mode = %q, want picked", notes.next.WatchMode)
	}
	if len(notes.next.WatchPaths) != 1 || notes.next.WatchPaths[0] != `C:\r\notes` {
		t.Errorf("paths = %v, want just notes", notes.next.WatchPaths)
	}
	if notes.next.WatchGroup != "" {
		t.Errorf("group should be cleared, got %q", notes.next.WatchGroup)
	}
}

func TestScopeEntriesPreserveOtherSettings(t *testing.T) {
	// The picker writes the whole settings struct, so it must not clobber
	// preferences that have nothing to do with watching.
	set := store.Settings{
		WatchMode:          "all",
		AutoFetchMinutes:   15,
		AutoFetchEnabled:   true,
		CloseToTray:        true,
		PullFromMainRebase: true,
	}
	for _, e := range buildScopeEntries(sample, set) {
		if e.next.AutoFetchMinutes != 15 || !e.next.PullFromMainRebase || !e.next.CloseToTray {
			t.Fatalf("entry %q dropped unrelated settings: %+v", e.key, e.next)
		}
	}
}
