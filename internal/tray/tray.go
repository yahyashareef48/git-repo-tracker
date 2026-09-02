// Package tray puts GitDeck in the Windows notification area, so the repo list
// is one click away without keeping a window open.
package tray

import (
	"image"
	"strconv"
	"sync"
	"time"

	"github.com/energye/systray"

	"gitdeck/internal/trayicon"
)

// Callbacks are the actions the tray can trigger. Every one of them is handled
// by the app, never by this package.
type Callbacks struct {
	Show     func()
	Toggle   func()
	FetchAll func()
	SyncAll  func()
	Quit     func()
}

// Status is what the tray displays about the tracked repos.
type Status struct {
	Repos    int
	Unpushed int
	Dirty    int
	// Version is shown in the tooltip so the running build is identifiable
	// without opening anything.
	Version string
}

var (
	mu        sync.Mutex
	launched  bool
	started   bool
	badged    bool
	iconPlain []byte
	iconBadge []byte
	// ready closes once systray has actually put the icon in the tray.
	ready = make(chan struct{})
	// miState is the disabled first item that shows the repo counts.
	miState *systray.MenuItem
)

// Start brings the tray up. It returns immediately; systray runs its own loop
// on a background goroutine. A failure to render the icon means no tray at
// all rather than an invisible one — see Running.
func Start(icon image.Image, cb Callbacks) error {
	mu.Lock()
	defer mu.Unlock()
	if launched {
		return nil
	}

	plain, err := trayicon.Build(icon, false)
	if err != nil {
		return err
	}
	badge, err := trayicon.Build(icon, true)
	if err != nil {
		return err
	}
	iconPlain, iconBadge = plain, badge
	launched = true

	go systray.Run(func() { onReady(cb) }, func() {
		mu.Lock()
		started = false
		mu.Unlock()
	})
	return nil
}

// WaitReady blocks until the icon is in the tray, or the timeout expires. Used
// only at startup, when whether to hide the window depends on the answer.
func WaitReady(timeout time.Duration) bool {
	select {
	case <-ready:
		return true
	case <-time.After(timeout):
		return false
	}
}

func onReady(cb Callbacks) {
	mu.Lock()
	started = true
	mu.Unlock()
	close(ready)

	systray.SetIcon(iconPlain)
	systray.SetTitle("GitDeck")
	systray.SetTooltip("GitDeck")

	// Left click is the fast path people expect from a tray app.
	systray.SetOnClick(func(systray.IMenu) {
		if cb.Toggle != nil {
			cb.Toggle()
		}
	})
	// Right click opens the menu; without this the menu never appears.
	systray.SetOnRClick(func(menu systray.IMenu) {
		if menu != nil {
			_ = menu.ShowMenu()
		}
	})

	miState = systray.AddMenuItem("No repositories yet", "")
	miState.Disable()
	systray.AddSeparator()

	miShow := systray.AddMenuItem("Open GitDeck", "Bring the window to the front")
	miShow.Click(func() {
		if cb.Show != nil {
			cb.Show()
		}
	})

	miFetch := systray.AddMenuItem("Fetch all", "Fetch every tracked repository")
	miFetch.Click(func() {
		if cb.FetchAll != nil {
			cb.FetchAll()
		}
	})

	miSync := systray.AddMenuItem("Sync all", "Fetch, pull and push every tracked repository")
	miSync.Click(func() {
		if cb.SyncAll != nil {
			cb.SyncAll()
		}
	})

	systray.AddSeparator()
	miQuit := systray.AddMenuItem("Quit GitDeck", "Close the app completely")
	miQuit.Click(func() {
		if cb.Quit != nil {
			cb.Quit()
		}
	})
}

// SetStatus updates the tooltip and swaps in the badged icon when something is
// waiting to be pushed. Called often, so it only touches the icon on a change.
func SetStatus(s Status) {
	mu.Lock()
	defer mu.Unlock()
	if !started {
		return
	}

	tip := "GitDeck"
	if s.Version != "" {
		tip += " " + s.Version
	}
	tip += " — " + strconv.Itoa(s.Repos) + " repositories"
	if s.Unpushed > 0 {
		tip += ", " + strconv.Itoa(s.Unpushed) + " to push"
	}
	if s.Dirty > 0 {
		tip += ", " + strconv.Itoa(s.Dirty) + " with changes"
	}
	systray.SetTooltip(tip)

	if miState != nil {
		if s.Repos == 0 {
			miState.SetTitle("No repositories yet")
		} else {
			miState.SetTitle(strconv.Itoa(s.Repos) + " repositories · " +
				strconv.Itoa(s.Unpushed) + " to push")
		}
	}

	want := s.Unpushed > 0
	if want != badged {
		badged = want
		if want {
			systray.SetIcon(iconBadge)
		} else {
			systray.SetIcon(iconPlain)
		}
	}
}

// Running reports whether the tray icon is actually up. Callers must check
// this before hiding a window to the tray: without an icon there would be no
// way to get the app back, or to quit it.
func Running() bool {
	mu.Lock()
	defer mu.Unlock()
	return started
}

// Stop removes the tray icon.
func Stop() {
	mu.Lock()
	defer mu.Unlock()
	if started {
		systray.Quit()
		started = false
	}
	launched = false
}
