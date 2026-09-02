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
)

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
