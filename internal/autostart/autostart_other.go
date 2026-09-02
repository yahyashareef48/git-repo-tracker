//go:build !windows

package autostart

// GitDeck is a Windows app; these keep non-Windows builds compiling so the
// package can be imported unconditionally.

func Enabled() bool { return false }

func Set(bool, string) error { return nil }

func LaunchedMinimised() bool { return false }
