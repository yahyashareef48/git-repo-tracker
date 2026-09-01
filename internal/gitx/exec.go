package gitx

import (
	"bytes"
	"context"
	"errors"
	"os/exec"
	"strings"
	"time"
)

// DefaultTimeout applies to local, fast operations.
const DefaultTimeout = 20 * time.Second

// RemoteTimeout applies to anything that touches the network.
const RemoteTimeout = 60 * time.Second

// Result is the raw outcome of a spawned command.
type Result struct {
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	ExitCode int    `json:"exitCode"`
	Command  string `json:"command"`
}

// ErrTimeout is returned when a command exceeded its deadline. Almost always
// this means git blocked waiting on credentials it was told not to ask for.
var ErrTimeout = errors.New("command timed out")

// Run executes a command in dir and captures its output. It never inherits a
// terminal, so git can never block on an interactive credential prompt: with
// GIT_TERMINAL_PROMPT=0 it fails fast with a usable error instead of hanging.
func Run(ctx context.Context, dir, name string, timeout time.Duration, args ...string) (Result, error) {
	if timeout <= 0 {
		timeout = DefaultTimeout
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir = dir
	cmd.Env = append(cmd.Environ(),
		"GIT_TERMINAL_PROMPT=0",
		"GCM_INTERACTIVE=never",
		"GIT_OPTIONAL_LOCKS=0",
		"LC_ALL=C",
	)
	hideWindow(cmd)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	runErr := cmd.Run()

	res := Result{
		Stdout:  stdout.String(),
		Stderr:  strings.TrimSpace(stderr.String()),
		Command: name + " " + strings.Join(args, " "),
	}

	if ctx.Err() == context.DeadlineExceeded {
		res.ExitCode = -1
		return res, ErrTimeout
	}

	var exitErr *exec.ExitError
	if errors.As(runErr, &exitErr) {
		res.ExitCode = exitErr.ExitCode()
		return res, runErr
	}
	if runErr != nil {
		res.ExitCode = -1
		return res, runErr
	}
	return res, nil
}

// Git runs a git subcommand in dir.
func Git(ctx context.Context, dir string, args ...string) (Result, error) {
	return Run(ctx, dir, "git", DefaultTimeout, args...)
}

// GitRemote runs a network-touching git subcommand with a longer deadline.
func GitRemote(ctx context.Context, dir string, args ...string) (Result, error) {
	return Run(ctx, dir, "git", RemoteTimeout, args...)
}

// Out runs git and returns trimmed stdout, discarding the error detail. Use
// only for probes where "it failed" and "it returned nothing" are equivalent.
func Out(ctx context.Context, dir string, args ...string) string {
	res, err := Git(ctx, dir, args...)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(res.Stdout)
}

// Lines splits command output into non-empty lines.
func Lines(s string) []string {
	raw := strings.Split(strings.ReplaceAll(s, "\r\n", "\n"), "\n")
	out := make([]string, 0, len(raw))
	for _, l := range raw {
		if l = strings.TrimRight(l, "\r"); l != "" {
			out = append(out, l)
		}
	}
	return out
}
