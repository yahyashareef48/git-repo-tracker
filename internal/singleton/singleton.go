//go:build windows

// Package singleton keeps one copy of each GitDeck binary running, and lets a
// second launch hand focus to the copy that is already there.
//
// Both binaries need this once they are separate: the tray launches the window
// on demand, and the user can also launch it from the Start menu. Without a
// guard that is two windows fighting over the same repositories.
package singleton

import (
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

// Lock is a held named mutex. Release it when the process is done.
type Lock struct {
	handle windows.Handle
}

// Acquire takes the named lock. ok is false when another process already holds
// it, which is the caller's signal to defer to that process and exit.
func Acquire(name string) (l *Lock, ok bool, err error) {
	p, err := windows.UTF16PtrFromString(name)
	if err != nil {
		return nil, false, err
	}
	h, err := windows.CreateMutex(nil, false, p)
	// CreateMutex returns a valid handle even when the mutex already exists, so
	// the error is the only way to tell the two apart.
	if err == windows.ERROR_ALREADY_EXISTS {
		if h != 0 {
			windows.CloseHandle(h)
		}
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	return &Lock{handle: h}, true, nil
}

// Release drops the lock.
func (l *Lock) Release() {
	if l != nil && l.handle != 0 {
		windows.CloseHandle(l.handle)
		l.handle = 0
	}
}

var (
	user32              = windows.NewLazySystemDLL("user32.dll")
	procFindWindowW     = user32.NewProc("FindWindowW")
	procShowWindow      = user32.NewProc("ShowWindow")
	procSetForegroundWn = user32.NewProc("SetForegroundWindow")
	procIsIconic        = user32.NewProc("IsIconic")
)

const (
	swRestore = 9
	swShow    = 5
)

// ActivateWindow brings an existing top-level window to the front by its title,
// restoring it first if it is minimised. Reports whether a window was found.
//
// This is how a second launch defers to the first: no IPC channel to keep in
// sync, just the window the user already has.
func ActivateWindow(title string) bool {
	t, err := syscall.UTF16PtrFromString(title)
	if err != nil {
		return false
	}
	hwnd, _, _ := procFindWindowW.Call(0, uintptr(unsafe.Pointer(t)))
	if hwnd == 0 {
		return false
	}

	if iconic, _, _ := procIsIconic.Call(hwnd); iconic != 0 {
		procShowWindow.Call(hwnd, swRestore)
	} else {
		procShowWindow.Call(hwnd, swShow)
	}
	procSetForegroundWn.Call(hwnd)
	return true
}
