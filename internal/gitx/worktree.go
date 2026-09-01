package gitx

import (
	"context"
	"path/filepath"
	"strings"
)

// Worktree is one entry of `git worktree list`.
type Worktree struct {
	Path     string `json:"path"`
	Name     string `json:"name"`
	Head     string `json:"head"`
	Branch   string `json:"branch"`
	Detached bool   `json:"detached"`
	Bare     bool   `json:"bare"`
	Locked   bool   `json:"locked"`
	IsMain   bool   `json:"isMain"`
}

// ListWorktrees returns every worktree attached to the repo at dir. The first
// entry git reports is always the main working tree.
func ListWorktrees(ctx context.Context, dir string) []Worktree {
	res, err := Git(ctx, dir, "worktree", "list", "--porcelain")
	if err != nil {
		return nil
	}

	var out []Worktree
	var cur *Worktree
	flush := func() {
		if cur != nil {
			cur.IsMain = len(out) == 0
			out = append(out, *cur)
			cur = nil
		}
	}

	for _, line := range strings.Split(strings.ReplaceAll(res.Stdout, "\r\n", "\n"), "\n") {
		line = strings.TrimRight(line, "\r")
		switch {
		case strings.HasPrefix(line, "worktree "):
			flush()
			p := filepath.FromSlash(strings.TrimPrefix(line, "worktree "))
			cur = &Worktree{Path: p, Name: filepath.Base(p)}
		case cur == nil:
			continue
		case strings.HasPrefix(line, "HEAD "):
			cur.Head = strings.TrimPrefix(line, "HEAD ")
		case strings.HasPrefix(line, "branch "):
			cur.Branch = strings.TrimPrefix(strings.TrimPrefix(line, "branch "), "refs/heads/")
		case line == "detached":
			cur.Detached = true
		case line == "bare":
			cur.Bare = true
		case line == "locked" || strings.HasPrefix(line, "locked "):
			cur.Locked = true
		}
	}
	flush()
	return out
}

// AddWorktree creates a linked worktree at path. When branch is empty the new
// worktree checks out a detached HEAD; when createBranch is set the branch is
// created rather than required to exist.
func AddWorktree(ctx context.Context, dir, path, branch string, createBranch bool) OpResult {
	if path == "" {
		return OpResult{Op: "worktree-add", Repo: dir, Kind: "generic",
			Error: "a worktree needs a folder"}
	}
	args := []string{"worktree", "add"}
	if branch != "" {
		if createBranch {
			args = append(args, "-b", branch)
		}
	}
	args = append(args, path)
	if branch != "" && !createBranch {
		args = append(args, branch)
	}

	res, err := Git(ctx, dir, args...)
	return newResult("worktree-add", dir, res, err)
}

// RemoveWorktree detaches a linked worktree. Without force git refuses while
// the worktree has uncommitted changes, which is the check we want by default.
func RemoveWorktree(ctx context.Context, dir, path string, force bool) OpResult {
	if path == "" {
		return OpResult{Op: "worktree-remove", Repo: dir, Kind: "generic",
			Error: "no worktree given"}
	}
	args := []string{"worktree", "remove"}
	if force {
		args = append(args, "--force")
	}
	args = append(args, path)

	res, err := Git(ctx, dir, args...)
	return newResult("worktree-remove", dir, res, err)
}
