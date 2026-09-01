//go:build windows

package gitx

import (
	"os/exec"
	"syscall"
)

// hideWindow stops Windows from flashing a console window for every git call.
// Without CREATE_NO_WINDOW a background fetch across ten repos strobes the
// screen with black boxes.
func hideWindow(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000, // CREATE_NO_WINDOW
	}
}
