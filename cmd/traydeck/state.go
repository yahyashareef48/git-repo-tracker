package main

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"runtime/debug"
	"sync"
	"time"

	"gitdeck/internal/github"
	"gitdeck/internal/gitx"
	"gitdeck/internal/repos"
	"gitdeck/internal/singleton"
	"gitdeck/internal/store"
	"gitdeck/internal/tray"
)

// windowTitle must match the Wails app's title: it is how a second launch finds
// the window that is already open.
const windowTitle = "GitDeck"

// panelTitle must differ from windowTitle, or looking for the full window finds
// the panel instead and nothing ever launches.
const panelTitle = "GitDeck Panel"

// windowExe is the full application, launched on demand and expected to sit
// beside this binary.
const windowExe = "GitDeck.exe"

// pollEvery is how often repository status is re-read while nothing is asking.
// The panel forces a read when it opens, so this only has to be often enough to
// keep the tray badge roughly honest.
const pollEvery = 60 * time.Second

// healthEvery is how often GitHub reachability is checked. Less often than the
// status poll because it costs a network round trip.
const healthEvery = 5 * time.Minute

// state is everything the tray and the panel read. One writer (the poller),
// many readers, so a plain RWMutex is enough.
type state struct {
	store *store.Store

	mu       sync.RWMutex
	views    []repos.View
	health   github.Health
	busy     bool
	lastPoll time.Time

	// refresh asks the poller to read now rather than waiting for the tick.
	refresh chan struct{}
	// showPanel asks the UI goroutine to open the panel.
	showPanel chan struct{}
	// startScopeOpen makes the next panel open with the watch picker showing.
	startScopeOpen bool
	// quit unwinds everything.
	quit chan struct{}
	once sync.Once
}

func newState(s *store.Store) *state {
	return &state{
		store:     s,
		refresh:   make(chan struct{}, 1),
		showPanel: make(chan struct{}, 1),
		quit:      make(chan struct{}),
	}
}

// snapshot returns the current rows and health without holding the lock.
func (s *state) snapshot() ([]repos.View, github.Health, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]repos.View, len(s.views))
	copy(out, s.views)
	return out, s.health, s.busy
}

// settings re-reads preferences from disk. The full window writes the same
// file, so the tray must not cache them for the life of the process.
func (s *state) settings() store.Settings {
	if s.store == nil {
		return store.Settings{}
	}
	return s.store.Settings()
}

// watched applies the user's watch scope to the current rows.
func (s *state) watched() []repos.View {
	views, _, _ := s.snapshot()
	return repos.Watched(views, s.settings())
}

// askRefresh nudges the poller without blocking if one is already queued.
func (s *state) askRefresh() {
	select {
	case s.refresh <- struct{}{}:
	default:
	}
}

// askPanel asks for the panel window, without blocking if one is already asked
// for.
func (s *state) askPanel() {
	select {
	case s.showPanel <- struct{}{}:
	default:
	}
}

func (s *state) stop() {
	s.once.Do(func() { close(s.quit) })
}

// run is the poll loop: read repositories, update the tray, repeat.
func (s *state) run(ctx context.Context) {
	s.reload(ctx)
	s.checkHealth(ctx)

	statusTick := time.NewTicker(pollEvery)
	healthTick := time.NewTicker(healthEvery)
	defer statusTick.Stop()
	defer healthTick.Stop()

	for {
		select {
		case <-s.quit:
			return
		case <-ctx.Done():
			return
		case <-statusTick.C:
			s.reload(ctx)
		case <-healthTick.C:
			s.checkHealth(ctx)
		case <-s.refresh:
			s.reload(ctx)
		}
	}
}

func (s *state) reload(ctx context.Context) {
	if s.store == nil {
		return
	}
	// Re-read the store file first: repositories and groups can be changed in
	// the full window while this process is running.
	s.store.Reload()

	views := repos.List(ctx, s.store)

	s.mu.Lock()
	s.views = views
	s.lastPoll = time.Now()
	s.mu.Unlock()

	c := repos.Summarise(views)
	tray.SetStatus(tray.Status{
		Repos: c.Repos, Unpushed: c.Unpushed, Dirty: c.Dirty, Version: version,
	})

	// A poll allocates buffers for every git invocation and then goes quiet for
	// a minute. Hand the pages back rather than sitting on a high-water mark.
	debug.FreeOSMemory()
}

func (s *state) checkHealth(ctx context.Context) {
	h := github.Check(ctx)
	s.mu.Lock()
	s.health = h
	s.mu.Unlock()
}

// runOp performs a git operation on one repository and refreshes afterwards.
// The tray owns git directly, so a fetch from the panel does not need the full
// window to be running.
func (s *state) runOp(ctx context.Context, path, op string) {
	s.mu.Lock()
	s.busy = true
	s.mu.Unlock()

	switch op {
	case "fetch":
		gitx.Fetch(ctx, path)
	case "pull":
		gitx.Pull(ctx, path, gitx.PullFF)
	case "push":
		gitx.Push(ctx, path)
	case "publish":
		gitx.PublishBranch(ctx, path)
	case "sync":
		gitx.Sync(ctx, path, gitx.PullFF)
	}

	s.mu.Lock()
	s.busy = false
	s.mu.Unlock()
	s.reload(ctx)
}

// runOpAll applies an operation to every watched repository, one at a time.
// Parallel network git across every repo trips rate limits and produces an
// unreadable mess when something fails.
func (s *state) runOpAll(ctx context.Context, op string) {
	for _, v := range s.watched() {
		select {
		case <-s.quit:
			return
		default:
		}
		s.runOp(ctx, v.Path, op)
	}
}

// openWindow brings up the full application, or focuses it if it is already
// running. Launching a second copy would give two windows editing one set of
// repositories.
func (s *state) openWindow() {
	if singleton.ActivateWindow(windowTitle) {
		return
	}

	exe, err := os.Executable()
	if err != nil {
		return
	}
	target := filepath.Join(filepath.Dir(exe), windowExe)
	if _, err := os.Stat(target); err != nil {
		return
	}

	cmd := exec.Command(target)
	cmd.Dir = filepath.Dir(target)
	_ = cmd.Start()
	// Nothing waits on it: the window owns its own lifetime and this process
	// must not block or hold a zombie if the user leaves it open for hours.
	if cmd.Process != nil {
		go func() { _ = cmd.Wait() }()
	}
}
