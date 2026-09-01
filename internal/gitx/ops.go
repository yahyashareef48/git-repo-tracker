package gitx

import (
	"context"
	"errors"
	"strings"
)

// OpResult is the outcome of one user-triggered git operation. It always
// carries the exact command that ran, so the log drawer can show the user
// precisely what GitDeck did on their behalf.
type OpResult struct {
	OK      bool   `json:"ok"`
	Op      string `json:"op"`
	Repo    string `json:"repo"`
	Command string `json:"command"`
	Stdout  string `json:"stdout"`
	Stderr  string `json:"stderr"`
	Error   string `json:"error"`
	// Kind classifies the failure so the UI can offer the right next step.
	// One of: auth, network, conflict, diverged, dirty, nothing, generic.
	Kind string `json:"kind"`
	Hint string `json:"hint"`
}

// PullStrategy decides how a pull reconciles diverged history.
type PullStrategy string

const (
	// PullFF refuses to create a merge commit. This is the default: it can
	// only ever fast-forward, so it is the one pull that cannot surprise you.
	PullFF     PullStrategy = "ff"
	PullMerge  PullStrategy = "merge"
	PullRebase PullStrategy = "rebase"
)

func newResult(op, dir string, res Result, err error) OpResult {
	out := OpResult{
		Op:      op,
		Repo:    dir,
		Command: res.Command,
		Stdout:  strings.TrimSpace(res.Stdout),
		Stderr:  res.Stderr,
		OK:      err == nil,
	}
	if err != nil {
		out.Error = firstLine(res.Stderr)
		if out.Error == "" {
			out.Error = err.Error()
		}
		out.Kind, out.Hint = classify(res.Stderr, err)
	}
	return out
}

// classify turns git's stderr into something the UI can act on. Matching on
// message text is brittle in principle, but git's exit codes carry almost no
// information, so the text is all there is.
func classify(stderr string, err error) (kind, hint string) {
	s := strings.ToLower(stderr)

	switch {
	case errors.Is(err, ErrTimeout):
		return "auth", "git stopped responding — it was most likely waiting for credentials. Run the command once in a terminal to sign in."

	case strings.Contains(s, "could not read username"),
		strings.Contains(s, "could not read password"),
		strings.Contains(s, "authentication failed"),
		strings.Contains(s, "terminal prompts disabled"),
		strings.Contains(s, "permission denied (publickey)"):
		return "auth", "GitDeck never asks for credentials. Sign in once with `gh auth login`, then retry."

	case strings.Contains(s, "could not resolve host"),
		strings.Contains(s, "unable to access"),
		strings.Contains(s, "failed to connect"),
		strings.Contains(s, "operation timed out"),
		strings.Contains(s, "network is unreachable"):
		return "network", "GitHub could not be reached. Check your connection and retry."

	case strings.Contains(s, "conflict"),
		strings.Contains(s, "fix conflicts and then commit"):
		return "conflict", "Resolve the conflicts in your editor, then commit."

	case strings.Contains(s, "not possible to fast-forward"),
		strings.Contains(s, "diverging branches"),
		strings.Contains(s, "need to specify how to reconcile"):
		return "diverged", "Your branch and its upstream have both moved. Merge or rebase to reconcile them."

	case strings.Contains(s, "local changes"),
		strings.Contains(s, "would be overwritten"),
		strings.Contains(s, "cannot pull with rebase"),
		strings.Contains(s, "unstaged changes"):
		return "dirty", "Commit or stash your local changes first."

	case strings.Contains(s, "no upstream"),
		strings.Contains(s, "has no upstream branch"):
		return "nothing", "This branch is not published yet. Use “Publish branch”."

	case strings.Contains(s, "everything up-to-date"):
		return "nothing", ""
	}
	return "generic", ""
}

// Fetch updates all remote-tracking refs and prunes deleted ones.
func Fetch(ctx context.Context, dir string) OpResult {
	res, err := GitRemote(ctx, dir, "fetch", "--all", "--prune")
	return newResult("fetch", dir, res, err)
}

// Pull brings the current branch up to date with its upstream.
func Pull(ctx context.Context, dir string, strategy PullStrategy) OpResult {
	args := []string{"pull"}
	switch strategy {
	case PullMerge:
		// --no-edit keeps git from opening an editor for the merge message.
		args = append(args, "--no-rebase", "--no-edit")
	case PullRebase:
		args = append(args, "--rebase")
	default:
		args = append(args, "--ff-only")
	}
	res, err := GitRemote(ctx, dir, args...)
	return newResult("pull", dir, res, err)
}

// Push publishes local commits. A branch with no upstream is published and
// tracked in one step, which is what "publish branch" means in VS Code.
func Push(ctx context.Context, dir string) OpResult {
	if Out(ctx, dir, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}") == "" {
		return PublishBranch(ctx, dir)
	}
	res, err := GitRemote(ctx, dir, "push")
	return newResult("push", dir, res, err)
}

// PublishBranch pushes the current branch and sets its upstream.
func PublishBranch(ctx context.Context, dir string) OpResult {
	remote := firstRemote(ctx, dir)
	if remote == "" {
		return OpResult{
			Op: "publish", Repo: dir, Kind: "nothing",
			Error: "this repository has no remote to publish to",
		}
	}
	res, err := GitRemote(ctx, dir, "push", "-u", remote, "HEAD")
	return newResult("publish", dir, res, err)
}

// Sync is fetch, then pull, then push — the single button that makes a repo
// match its remote. It stops at the first failure rather than pushing on top
// of a failed pull.
func Sync(ctx context.Context, dir string, strategy PullStrategy) []OpResult {
	results := []OpResult{Fetch(ctx, dir)}
	if !results[0].OK {
		return results
	}

	// Only pull when there is something to pull; an up-to-date branch should
	// not produce a confusing "already up to date" line in the log.
	st := GetStatus(ctx, dir)
	if st.Behind > 0 {
		pull := Pull(ctx, dir, strategy)
		results = append(results, pull)
		if !pull.OK {
			return results
		}
		st = GetStatus(ctx, dir)
	}

	if st.Ahead > 0 || st.Upstream == "" {
		results = append(results, Push(ctx, dir))
	}
	return results
}

// PullFromMain brings the repo's default branch into the current branch
// without leaving it. Merge is the default; rebase is opt-in.
func PullFromMain(ctx context.Context, dir string, rebase bool) []OpResult {
	remote := firstRemote(ctx, dir)
	if remote == "" {
		return []OpResult{{
			Op: "pull-from-main", Repo: dir, Kind: "nothing",
			Error: "this repository has no remote",
		}}
	}

	main := resolveDefaultBranch(ctx, dir,
		Out(ctx, dir, "symbolic-ref", "--short", "refs/remotes/"+remote+"/HEAD"))

	fetchRes, err := GitRemote(ctx, dir, "fetch", remote, main)
	fetch := newResult("fetch", dir, fetchRes, err)
	if !fetch.OK {
		return []OpResult{fetch}
	}

	args := []string{"merge", "--no-edit", remote + "/" + main}
	if rebase {
		args = []string{"rebase", remote + "/" + main}
	}
	res, err := Git(ctx, dir, args...)
	integrate := newResult("pull-from-main", dir, res, err)
	return []OpResult{fetch, integrate}
}

func firstRemote(ctx context.Context, dir string) string {
	remotes := Lines(Out(ctx, dir, "remote"))
	for _, r := range remotes {
		if r == "origin" {
			return r
		}
	}
	if len(remotes) > 0 {
		return remotes[0]
	}
	return ""
}
