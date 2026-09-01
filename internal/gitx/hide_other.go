//go:build !windows

package gitx

import "os/exec"

func hideWindow(cmd *exec.Cmd) {}
