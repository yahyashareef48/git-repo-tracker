package gitx

import (
	"context"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
)

// Status is everything the repo list needs to render one row.
type Status struct {
	Path          string   `json:"path"`
	Name          string   `json:"name"`
	Root          string   `json:"root"`
	Branch        string   `json:"branch"`
	Detached      bool     `json:"detached"`
	Upstream      string   `json:"upstream"`
	Ahead         int      `json:"ahead"`
	Behind        int      `json:"behind"`
	Staged        int      `json:"staged"`
	Unstaged      int      `json:"unstaged"`
	Untracked     int      `json:"untracked"`
	Conflicted    int      `json:"conflicted"`
	StashCount    int      `json:"stashCount"`
	Remotes       []string `json:"remotes"`
	HasRemote     bool     `json:"hasRemote"`
	DefaultBranch string   `json:"defaultBranch"`
	IsWorktree    bool     `json:"isWorktree"`
	CommonDir     string   `json:"commonDir"`
	LastCommit    string   `json:"lastCommit"`
	LastCommitAgo string   `json:"lastCommitAgo"`
	Error         string   `json:"error"`
}

// Dirty reports whether the working tree has any uncommitted change.
func (s Status) Dirty() bool {
	return s.Staged+s.Unstaged+s.Untracked+s.Conflicted > 0
}

// IsRepo reports whether dir is inside a git working tree.
func IsRepo(ctx context.Context, dir string) bool {
	return Out(ctx, dir, "rev-parse", "--is-inside-work-tree") == "true"
}

// Root returns the working-tree root for dir, or "" if dir is not a repo.
func Root(ctx context.Context, dir string) string {
	root := Out(ctx, dir, "rev-parse", "--show-toplevel")
	if root == "" {
		return ""
	}
	return filepath.FromSlash(root)
}

// GetStatus collects the full status of the repo at dir.
//
// Process spawns dominate the cost here — a status read is six of them — so the
// independent ones run concurrently and the rest are batched into single git
// invocations. Failing to read one optional field (stashes, default branch)
// never fails the whole call: the row still renders with what we did read.
func GetStatus(ctx context.Context, dir string) Status {
	s := Status{Path: dir, Name: filepath.Base(dir)}

	// One rev-parse answers three questions at once.
	locate := Out(ctx, dir, "rev-parse", "--path-format=absolute",
		"--show-toplevel", "--git-dir", "--git-common-dir")
	loc := Lines(locate)
	if len(loc) < 1 {
		s.Error = "not a git repository"
		return s
	}

	s.Root = filepath.FromSlash(loc[0])
	s.Name = filepath.Base(s.Root)
	if len(loc) >= 3 {
		gitDir := filepath.Clean(filepath.FromSlash(loc[1]))
		common := filepath.Clean(filepath.FromSlash(loc[2]))
		s.CommonDir = common
		// A linked worktree's .git is a file pointing elsewhere, so its git-dir
		// and git-common-dir differ. That is how worktrees get nested under
		// their parent repo in the UI.
		s.IsWorktree = !strings.EqualFold(gitDir, common)
	}

	var (
		wg        sync.WaitGroup
		statusErr string
		statusOut string
		remoteOut string
		stashOut  string
		logOut    string
		symrefOut string
		mu        sync.Mutex
		setErr    = func(e string) { mu.Lock(); statusErr = e; mu.Unlock() }
		run       = func(f func()) { wg.Add(1); go func() { defer wg.Done(); f() }() }
	)

	run(func() {
		res, err := Git(ctx, dir, "status", "--porcelain=v2", "--branch", "--untracked-files=normal")
		if err != nil {
			setErr(firstLine(res.Stderr))
			return
		}
		statusOut = res.Stdout
	})
	run(func() { remoteOut = Out(ctx, dir, "remote") })
	run(func() { stashOut = Out(ctx, dir, "rev-list", "--walk-reflogs", "--count", "refs/stash") })
	run(func() { logOut = Out(ctx, dir, "log", "-1", "--pretty=%s%x1f%cr") })
	run(func() { symrefOut = Out(ctx, dir, "symbolic-ref", "--short", "refs/remotes/origin/HEAD") })

	wg.Wait()

	if statusErr != "" {
		s.Error = statusErr
		return s
	}
	parseStatus(statusOut, &s)

	if remoteOut != "" {
		s.Remotes = Lines(remoteOut)
		s.HasRemote = len(s.Remotes) > 0
	}
	if n, err := strconv.Atoi(stashOut); err == nil {
		s.StashCount = n
	}
	if subject, ago, ok := strings.Cut(logOut, "\x1f"); ok {
		s.LastCommit = subject
		s.LastCommitAgo = ago
	}
	s.DefaultBranch = resolveDefaultBranch(ctx, dir, symrefOut)

	return s
}

func parseStatus(stdout string, s *Status) {
	for _, line := range Lines(stdout) {
		switch {
		case strings.HasPrefix(line, "# branch.head "):
			head := strings.TrimPrefix(line, "# branch.head ")
			if head == "(detached)" {
				s.Detached = true
				s.Branch = "detached"
			} else {
				s.Branch = head
			}
		case strings.HasPrefix(line, "# branch.upstream "):
			s.Upstream = strings.TrimPrefix(line, "# branch.upstream ")
		case strings.HasPrefix(line, "# branch.ab "):
			for _, f := range strings.Fields(strings.TrimPrefix(line, "# branch.ab ")) {
				if len(f) < 2 {
					continue
				}
				n, err := strconv.Atoi(f[1:])
				if err != nil {
					continue
				}
				if f[0] == '+' {
					s.Ahead = n
				} else if f[0] == '-' {
					s.Behind = n
				}
			}
		case strings.HasPrefix(line, "1 "), strings.HasPrefix(line, "2 "):
			// "<1|2> <XY> ..." where X is the staged and Y the worktree state.
			fields := strings.SplitN(line, " ", 3)
			if len(fields) < 2 || len(fields[1]) < 2 {
				continue
			}
			if fields[1][0] != '.' {
				s.Staged++
			}
			if fields[1][1] != '.' {
				s.Unstaged++
			}
		case strings.HasPrefix(line, "u "):
			s.Conflicted++
		case strings.HasPrefix(line, "? "):
			s.Untracked++
		}
	}
}

// resolveDefaultBranch prefers what origin published. symref is the already-read
// `origin/HEAD`; only when that is empty do we pay for extra lookups.
func resolveDefaultBranch(ctx context.Context, dir, symref string) string {
	if symref != "" {
		return strings.TrimPrefix(symref, "origin/")
	}
	for _, candidate := range []string{"main", "master", "develop"} {
		if Out(ctx, dir, "rev-parse", "--verify", "--quiet",
			"refs/remotes/origin/"+candidate) != "" {
			return candidate
		}
	}
	for _, candidate := range []string{"main", "master", "develop"} {
		if Out(ctx, dir, "rev-parse", "--verify", "--quiet", "refs/heads/"+candidate) != "" {
			return candidate
		}
	}
	return "main"
}

func firstLine(s string) string {
	if i := strings.IndexAny(s, "\r\n"); i >= 0 {
		return s[:i]
	}
	return s
}
