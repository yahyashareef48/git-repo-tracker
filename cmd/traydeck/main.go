// Command traydeck is GitDeck's always-running half: a tray icon, a repository
// poller, and a compact panel drawn without a browser.
//
// It exists because the full application keeps a Chromium engine resident for
// as long as it runs, and the panel — a list of text rows — is what actually
// gets looked at. Splitting the two means the browser is only loaded while
// someone is reading a diff.
//
// The heavy window lives in GitDeck.exe and is launched on demand.
package main

import (
	"context"
	"os"
	"runtime/debug"
	"slices"

	"gioui.org/app"

	"gitdeck/internal/assets"
	"gitdeck/internal/singleton"
	"gitdeck/internal/store"
	"gitdeck/internal/tray"
)

// version is stamped at build time with -ldflags "-X main.version=x.y.z".
var version = "dev"

// lockName keeps one tray process per user session. Two would mean two icons
// and two pollers fighting over the same repositories.
const lockName = "Local\\GitDeckTray"

func main() {
	// Reading ten repositories concurrently leaves a lot of short-lived buffers
	// behind. This process spends most of its life asleep, so returning that
	// memory to the OS matters more than the cost of collecting it.
	debug.SetGCPercent(40)

	lock, ok, err := singleton.Acquire(lockName)
	if err == nil && !ok {
		// Another tray is already running. Hand it the click if this launch was
		// a user double-clicking the exe again, then step aside.
		singleton.ActivateWindow(windowTitle)
		return
	}
	defer lock.Release()

	st, err := store.New()
	if err != nil {
		// Without the store there is nothing to watch. Fail loudly rather than
		// sitting in the tray showing nothing.
		os.Stderr.WriteString("gitdeck tray: " + err.Error() + "\n")
		os.Exit(1)
	}

	s := newState(st)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go s.run(ctx)
	startTray(s)

	// --panel opens the panel straight away. Without it the only way in is a
	// tray click, which makes the panel awkward to work on.
	if slices.Contains(os.Args[1:], "--panel") {
		s.askPanel()
	}

	// Gio owns the main goroutine on Windows, and the panel is created from
	// panelLoop when the tray asks for one.
	go panelLoop(ctx, s)
	app.Main()
}

// startTray brings up the notification icon and wires its menu to the state.
func startTray(s *state) {
	icon, err := assets.AppIcon()
	if err != nil {
		return
	}

	_ = tray.Start(icon, tray.Callbacks{
		// Left click opens the panel: the quick look is the whole point.
		Toggle: s.askPanel,
		// The menu's own entry opens the full application instead.
		Show:     s.openWindow,
		FetchAll: func() { go s.runOpAll(context.Background(), "fetch") },
		SyncAll:  func() { go s.runOpAll(context.Background(), "sync") },
		Quit: func() {
			s.stop()
			tray.Stop()
			os.Exit(0)
		},
	})
}
