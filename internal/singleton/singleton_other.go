//go:build !windows

package singleton

// GitDeck is a Windows app; these keep other platforms compiling so the package
// can be imported unconditionally.

type Lock struct{}

func Acquire(string) (*Lock, bool, error) { return &Lock{}, true, nil }

func (l *Lock) Release() {}

func ActivateWindow(string) bool { return false }
