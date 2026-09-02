package main

import (
	"gioui.org/unit"
	"golang.org/x/sys/windows"
)

// The panel is a widget, not a window: a square a sixth of the screen wide,
// wherever you drop it. A fixed square keeps it recognisable at a glance and
// stops it jumping about as repositories come and go.
const screenFraction = 6

// Sane bounds for the square, in device-independent pixels. Below the floor
// the rows stop being readable; above the ceiling it stops being a widget.
const (
	minSquare unit.Dp = 260
	maxSquare unit.Dp = 520
)

var (
	user32            = windows.NewLazySystemDLL("user32.dll")
	procSystemMetrics = user32.NewProc("GetSystemMetrics")
	procDpiForSystem  = user32.NewProc("GetDpiForSystem")
	procSetWindowPos  = user32.NewProc("SetWindowPos")
	procGetWindowLong = user32.NewProc("GetWindowLongPtrW")
	procSetWindowLong = user32.NewProc("SetWindowLongPtrW")
)

// SetWindowPos arguments for pinning a window above the others without
// moving, resizing or focusing it.
const (
	hwndTopmost       = ^uintptr(0) // (HWND)-1
	swpNoSize         = 0x0001
	swpNoMove         = 0x0002
	swpNoActivate     = 0x0010
	swpFrameChanged   = 0x0020
	swpAsyncWindowPos = 0x4000
)

// Extended window styles. A tool window is kept out of the taskbar and out
// of alt-tab, which is what makes this a widget rather than an application.
const (
	gwlExStyle     = ^uintptr(19) // -20
	wsExToolWindow = 0x00000080
	wsExAppWindow  = 0x00040000
)

// pinOnTop keeps the window above other windows. A widget that disappears
// behind whatever you click next is not a widget, it is a window you have to
// go and find again.
// makeWidget pins the window above the others and takes it out of the
// taskbar, so it behaves like a desk accessory instead of an app.
func makeWidget(hwnd uintptr) {
	if hwnd == 0 {
		return
	}
	go func() {
		ex, _, _ := procGetWindowLong.Call(hwnd, gwlExStyle)
		ex = (ex | wsExToolWindow) &^ wsExAppWindow
		procSetWindowLong.Call(hwnd, gwlExStyle, ex)
		// The frame has to be told it changed or the taskbar keeps the button.
		procSetWindowPos.Call(hwnd, hwndTopmost, 0, 0, 0, 0,
			swpNoMove|swpNoSize|swpNoActivate|swpFrameChanged|swpAsyncWindowPos)
	}()
}

func pinOnTop(hwnd uintptr) {
	if hwnd == 0 {
		return
	}
	// SetWindowPos sends messages to the thread that owns the window and
	// waits for them to be handled. Gio owns the window on the OS main
	// thread, and that thread is what is waiting for this event handler to
	// return, so calling it here deadlocks: the panel hangs on open and
	// Windows paints the "Not Responding" ghost frame over it. ASYNCWINDOWPOS
	// posts the request instead of sending it, and the goroutine keeps even
	// that off the event loop.
	go procSetWindowPos.Call(hwnd, hwndTopmost, 0, 0, 0, 0,
		swpNoMove|swpNoSize|swpNoActivate|swpAsyncWindowPos)
}

const smCXScreen = 0

// squareDp is the side of the panel in the density-independent pixels Gio
// sizes windows in, given the physical screen width and Gio's own scale.
// Taking the scale from Gio rather than from Windows matters: on a scaled
// display GetDpiForSystem reports the system-wide value, which can be lower
// than the monitor the window is actually on, and the square comes out a
// quarter too big.
func squareDp(widthPx int, pxPerDp float32) unit.Dp {
	if widthPx <= 0 {
		return minSquare
	}
	if pxPerDp <= 0 {
		pxPerDp = 1
	}
	side := unit.Dp(float32(widthPx) / screenFraction / pxPerDp)
	if side < minSquare {
		return minSquare
	}
	if side > maxSquare {
		return maxSquare
	}
	return side
}

// primaryWidthPx is the width of the primary display in physical pixels. It
// returns 0 if Windows will not say, and the caller falls back to the floor.
func primaryWidthPx() int {
	n, _, _ := procSystemMetrics.Call(uintptr(smCXScreen))
	return int(int32(n))
}

// guessScale is the scale to open the window at, before Gio has drawn a frame
// and reported the real one. GetDpiForSystem arrived in Windows 10 1607;
// anything older is treated as unscaled.
func guessScale() float32 {
	if err := procDpiForSystem.Find(); err != nil {
		return 1
	}
	n, _, _ := procDpiForSystem.Call()
	if dpi := float32(uint32(n)); dpi > 0 {
		return dpi / 96
	}
	return 1
}
