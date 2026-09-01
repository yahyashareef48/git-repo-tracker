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
