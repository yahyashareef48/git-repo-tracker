package store

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// Entry is one tracked repository. Path is the identity — the same folder is
// never tracked twice.
type Entry struct {
	Path    string `json:"path"`
	Name    string `json:"name"`
	Pinned  bool   `json:"pinned"`
	AddedAt string `json:"addedAt"`
	// Group is a free-text label the user assigns. Empty means ungrouped.
	Group string `json:"group"`
}

// Settings holds user preferences that outlive a session.
type Settings struct {
	AutoFetchMinutes int  `json:"autoFetchMinutes"`
	AutoFetchEnabled bool `json:"autoFetchEnabled"`
	StartMinimised   bool `json:"startMinimised"`
	// CloseToTray keeps the app running in the notification area when the
	// window is closed, which is the point of having a tray icon at all.
	CloseToTray bool `json:"closeToTray"`
	// PullFromMainRebase switches "pull from main" from merge to rebase.
	// Merge is the default, per the plan.
	PullFromMainRebase bool `json:"pullFromMainRebase"`

	// WatchMode decides what the compact tray panel shows: "all", "group" or
	// "picked". Tracking ten repos does not mean wanting ten in a HUD.
	WatchMode string `json:"watchMode"`
	// WatchGroup is the group shown when WatchMode is "group".
	WatchGroup string `json:"watchGroup"`
	// WatchPaths are the repos shown when WatchMode is "picked".
	WatchPaths []string `json:"watchPaths"`
}

type data struct {
	Repos    []Entry  `json:"repos"`
	Settings Settings `json:"settings"`
}

// Store persists the tracked repo list to %APPDATA%/GitDeck/repos.json.
type Store struct {
	mu   sync.RWMutex
	path string
	d    data
}

func defaultSettings() Settings {
	return Settings{
		AutoFetchMinutes: 5,
		AutoFetchEnabled: true,
		CloseToTray:      true,
		WatchMode:        "all",
	}
}

// New loads the store from disk, creating it on first run.
func New() (*Store, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return nil, err
	}
	dir = filepath.Join(dir, "GitDeck")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}

	s := &Store{path: filepath.Join(dir, "repos.json")}
	s.d.Settings = defaultSettings()

	raw, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return s, s.save()
		}
		return nil, err
	}
	if err := json.Unmarshal(raw, &s.d); err != nil {
		// A corrupt file must not brick the app; start clean and overwrite.
		s.d = data{Settings: defaultSettings()}
		return s, s.save()
	}
	if s.d.Settings.AutoFetchMinutes <= 0 {
		s.d.Settings.AutoFetchMinutes = 5
	}
	if s.d.Settings.WatchMode == "" {
		s.d.Settings.WatchMode = "all"
	}
	return s, nil
}

// Reload re-reads the file from disk, discarding what is held in memory.
//
// Two processes now share this file: the tray polls repositories while the
// full window edits them. Without this the tray would serve whatever it read
// at launch for as long as it ran.
func (s *Store) Reload() error {
	raw, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	var fresh data
	if err := json.Unmarshal(raw, &fresh); err != nil {
		// A half-written file is not worth throwing away good state for; the
		// next tick will read it again.
		return err
	}
	if fresh.Settings.AutoFetchMinutes <= 0 {
		fresh.Settings.AutoFetchMinutes = 5
	}
	if fresh.Settings.WatchMode == "" {
		fresh.Settings.WatchMode = "all"
	}

	s.mu.Lock()
	s.d = fresh
	s.mu.Unlock()
	return nil
}

// File returns the on-disk location, for display in settings.
func (s *Store) File() string { return s.path }

// save writes the file. Callers must hold the lock.
func (s *Store) save() error {
	raw, err := json.MarshalIndent(s.d, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

// List returns the tracked repos, pinned ones first.
func (s *Store) List() []Entry {
	s.mu.RLock()
	defer s.mu.RUnlock()

	out := make([]Entry, len(s.d.Repos))
	copy(out, s.d.Repos)
	return out
}

// Has reports whether path is already tracked.
func (s *Store) Has(path string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.indexOf(path) >= 0
}

// Get returns the tracked entry for path, if there is one. Callers that only
// have a path must use this rather than fabricating an Entry: a synthesised
// one silently loses the repo's group and pin.
func (s *Store) Get(path string) (Entry, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if i := s.indexOf(path); i >= 0 {
		return s.d.Repos[i], true
	}
	return Entry{}, false
}

// indexOf must be called under a held lock.
func (s *Store) indexOf(path string) int {
	want := normalise(path)
	for i, e := range s.d.Repos {
		if normalise(e.Path) == want {
			return i
		}
	}
	return -1
}

// Add tracks path. Adding an already-tracked path is a no-op, not an error.
func (s *Store) Add(path, name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.indexOf(path) >= 0 {
		return nil
	}
	s.d.Repos = append(s.d.Repos, Entry{
		Path:    path,
		Name:    name,
		AddedAt: time.Now().Format(time.RFC3339),
	})
	return s.save()
}

// Remove untracks path. It never touches the folder on disk.
func (s *Store) Remove(path string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	i := s.indexOf(path)
	if i < 0 {
		return nil
	}
	s.d.Repos = append(s.d.Repos[:i], s.d.Repos[i+1:]...)
	return s.save()
}

// SetPinned toggles the pin flag for path.
func (s *Store) SetPinned(path string, pinned bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	i := s.indexOf(path)
	if i < 0 {
		return nil
	}
	s.d.Repos[i].Pinned = pinned
	return s.save()
}

// SetGroup moves a repo into a group. An empty name ungroups it.
func (s *Store) SetGroup(path, group string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	i := s.indexOf(path)
	if i < 0 {
		return nil
	}
	s.d.Repos[i].Group = strings.TrimSpace(group)
	return s.save()
}

// Groups returns every group name in use, sorted, without duplicates.
func (s *Store) Groups() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()

	seen := map[string]bool{}
	var out []string
	for _, e := range s.d.Repos {
		if e.Group != "" && !seen[e.Group] {
			seen[e.Group] = true
			out = append(out, e.Group)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		return strings.ToLower(out[i]) < strings.ToLower(out[j])
	})
	return out
}

// Reorder rewrites the repo order to match paths. Any tracked repo missing
// from paths keeps its relative position at the end.
func (s *Store) Reorder(paths []string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	seen := make(map[string]bool, len(paths))
	next := make([]Entry, 0, len(s.d.Repos))
	for _, p := range paths {
		if i := s.indexOf(p); i >= 0 && !seen[normalise(p)] {
			seen[normalise(p)] = true
			next = append(next, s.d.Repos[i])
		}
	}
	for _, e := range s.d.Repos {
		if !seen[normalise(e.Path)] {
			next = append(next, e)
		}
	}
	s.d.Repos = next
	return s.save()
}

// Settings returns a copy of the current settings.
func (s *Store) Settings() Settings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.d.Settings
}

// SaveSettings replaces the settings wholesale.
func (s *Store) SaveSettings(v Settings) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if v.AutoFetchMinutes <= 0 {
		v.AutoFetchMinutes = 5
	}
	if v.WatchMode == "" {
		v.WatchMode = "all"
	}
	s.d.Settings = v
	return s.save()
}

// normalise makes path comparison case- and separator-insensitive, which is
// what Windows callers expect.
func normalise(p string) string {
	return strings.ToLower(filepath.Clean(p))
}
