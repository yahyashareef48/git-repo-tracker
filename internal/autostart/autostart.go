//go:build windows

// Package autostart toggles whether GitDeck launches when Windows starts.
package autostart

import (
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/sys/windows/registry"
)

// runKey is the per-user Run key. Per-user rather than machine-wide on purpose:
// it needs no elevation and only affects the person who asked for it.
const runKey = `Software\Microsoft\Windows\CurrentVersion\Run`

// valueName is how the entry appears in Task Manager's Startup tab.
const valueName = "GitDeck"

// minimisedFlag tells the launched instance to start hidden in the tray.
const minimisedFlag = "--minimised"

// Enabled reports whether the Run entry exists.
func Enabled() bool {
	k, err := registry.OpenKey(registry.CURRENT_USER, runKey, registry.QUERY_VALUE)
	if err != nil {
		return false
	}
	defer k.Close()

	v, _, err := k.GetStringValue(valueName)
	return err == nil && v != ""
}

// Set adds or removes the Run entry.
//
// exeName selects which binary to register, resolved beside the running one.
// After the split that is the tray, not the window: launching a browser engine
// at sign-in is the cost this whole change exists to avoid. An empty name
// registers the running executable.
func Set(on bool, exeName string) error {
	k, err := registry.OpenKey(registry.CURRENT_USER, runKey, registry.SET_VALUE)
	if err != nil {
		return err
	}
	defer k.Close()

	if !on {
		err := k.DeleteValue(valueName)
		// Removing something that was never there is a success, not a failure.
		if err == registry.ErrNotExist {
			return nil
		}
		return err
	}

	exe, err := os.Executable()
	if err != nil {
		return err
	}
	if exeName != "" {
		sibling := filepath.Join(filepath.Dir(exe), exeName)
		if _, err := os.Stat(sibling); err == nil {
			exe = sibling
		}
	}
	// Quoted because Program Files paths contain spaces.
	return k.SetStringValue(valueName, `"`+exe+`" `+minimisedFlag)
}

// LaunchedMinimised reports whether this process was started by the Run entry
// and should therefore stay in the tray rather than showing its window.
func LaunchedMinimised() bool {
	for _, arg := range os.Args[1:] {
		if strings.EqualFold(arg, minimisedFlag) {
			return true
		}
	}
	return false
}
