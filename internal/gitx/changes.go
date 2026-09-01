package gitx

import (
	"context"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// Change is one file in the working tree that differs from HEAD or the index.
// A file modified in both places produces two Changes, one staged and one not,
// exactly as it appears in git's own status.
type Change struct {
	Path string `json:"path"`
	// Orig is the previous path of a rename, otherwise empty.
	Orig   string `json:"orig"`
	Staged bool   `json:"staged"`
	// Kind is one of: added, modified, deleted, renamed, copied, untracked,
	// conflicted, typechange.
	Kind string `json:"kind"`
	// Code is git's raw status letter, kept for the tooltip.
	Code string `json:"code"`
}

// Changes is the working tree split the way the UI renders it.
type Changes struct {
	Staged     []Change `json:"staged"`
	Unstaged   []Change `json:"unstaged"`
	Untracked  []Change `json:"untracked"`
	Conflicted []Change `json:"conflicted"`
	Error      string   `json:"error"`
}

func kindOf(code byte) string {
	switch code {
	case 'A':
		return "added"
	case 'M':
		return "modified"
	case 'D':
		return "deleted"
	case 'R':
		return "renamed"
	case 'C':
		return "copied"
	case 'T':
		return "typechange"
	default:
		return "modified"
	}
}

// GetChanges reads the working tree. It uses NUL-separated output so paths with
// spaces, quotes or non-ASCII characters survive intact — git's default
// quoting would need un-escaping and gets it wrong for some encodings.
func GetChanges(ctx context.Context, dir string) Changes {
	var c Changes

	res, err := Git(ctx, dir, "status", "--porcelain=v2", "-z", "--untracked-files=all")
	if err != nil {
		c.Error = firstLine(res.Stderr)
		return c
	}

	fields := strings.Split(res.Stdout, "\x00")
	for i := 0; i < len(fields); i++ {
		entry := fields[i]
		if entry == "" {
			continue
		}

		switch entry[0] {
		case '?':
			c.Untracked = append(c.Untracked, Change{
				Path: strings.TrimPrefix(entry, "? "),
				Kind: "untracked", Code: "?",
			})

		case '!':
			// Ignored files are not shown.

		case 'u':
			parts := strings.SplitN(entry, " ", 11)
			if len(parts) == 11 {
				c.Conflicted = append(c.Conflicted, Change{
					Path: parts[10], Kind: "conflicted", Code: parts[1],
				})
			}

		case '1', '2':
			renamed := entry[0] == '2'
			// Ordinary: "1 XY sub mH mI mW hH hI path"
			// Renamed:  "2 XY sub mH mI mW hH hI Xscore path" + NUL + origPath
			want := 9
			if renamed {
				want = 10
			}
			parts := strings.SplitN(entry, " ", want)
			if len(parts) < want || len(parts[1]) < 2 {
				continue
			}
			path := parts[want-1]

			var orig string
			if renamed && i+1 < len(fields) {
				// A rename entry is followed by its original path as the very
				// next NUL-separated field.
				i++
				orig = fields[i]
			}

			xy := parts[1]
			if xy[0] != '.' {
				c.Staged = append(c.Staged, Change{
					Path: path, Orig: orig, Staged: true,
					Kind: kindOf(xy[0]), Code: string(xy[0]),
				})
			}
			if xy[1] != '.' {
				c.Unstaged = append(c.Unstaged, Change{
					Path: path, Orig: orig,
					Kind: kindOf(xy[1]), Code: string(xy[1]),
				})
			}
		}
	}
	return c
}

// maxDiffBytes caps what is sent to the frontend. A generated lock file can be
// megabytes of noise that no one is going to read line by line.
const maxDiffBytes = 400 * 1024

// Diff is one file's changes, ready to render.
type Diff struct {
	Path      string `json:"path"`
	Staged    bool   `json:"staged"`
	Text      string `json:"text"`
	Binary    bool   `json:"binary"`
	Truncated bool   `json:"truncated"`
	Error     string `json:"error"`
}

// GetDiff returns the unified diff for one file. Untracked files have no diff
// of their own, so their contents are presented as an all-added patch.
func GetDiff(ctx context.Context, dir, path string, staged, untracked bool) Diff {
	d := Diff{Path: path, Staged: staged}

	if untracked {
		return untrackedDiff(dir, path)
	}

	args := []string{"diff", "--no-color", "--no-ext-diff", "-U3"}
	if staged {
		args = append(args, "--cached")
	}
	args = append(args, "--", path)

	res, err := Git(ctx, dir, args...)
	if err != nil {
		d.Error = firstLine(res.Stderr)
		return d
	}

	d.Text = res.Stdout
	if strings.Contains(d.Text, "Binary files ") || strings.Contains(d.Text, "GIT binary patch") {
		d.Binary = true
		d.Text = ""
		return d
	}
	if len(d.Text) > maxDiffBytes {
		d.Text = d.Text[:maxDiffBytes]
		d.Truncated = true
	}
	return d
}

func untrackedDiff(dir, path string) Diff {
	d := Diff{Path: path}

	raw, err := os.ReadFile(filepath.Join(dir, filepath.FromSlash(path)))
	if err != nil {
		d.Error = err.Error()
		return d
	}
	if isBinary(raw) {
		d.Binary = true
		return d
	}
	if len(raw) > maxDiffBytes {
		raw = raw[:maxDiffBytes]
		d.Truncated = true
	}

	lines := strings.Split(strings.TrimSuffix(strings.ReplaceAll(string(raw), "\r\n", "\n"), "\n"), "\n")

	var b strings.Builder
	b.WriteString("--- /dev/null\n+++ b/" + path + "\n")
	b.WriteString("@@ -0,0 +1," + strconv.Itoa(len(lines)) + " @@\n")
	for _, l := range lines {
		b.WriteString("+" + l + "\n")
	}
	d.Text = b.String()
	return d
}

// isBinary uses git's own heuristic: a NUL byte near the start of the file.
func isBinary(b []byte) bool {
	n := len(b)
	if n > 8000 {
		n = 8000
	}
	for i := 0; i < n; i++ {
		if b[i] == 0 {
			return true
		}
	}
	return false
}

// Stage adds paths to the index. An empty list stages everything.
func Stage(ctx context.Context, dir string, paths []string) OpResult {
	args := []string{"add", "--"}
	if len(paths) == 0 {
		args = []string{"add", "-A", "--", "."}
	} else {
		args = append(args, paths...)
	}
	res, err := Git(ctx, dir, args...)
	return newResult("stage", dir, res, err)
}

// Unstage removes paths from the index, leaving the working tree untouched.
func Unstage(ctx context.Context, dir string, paths []string) OpResult {
	args := []string{"restore", "--staged", "--"}
	if len(paths) == 0 {
		args = append(args, ".")
	} else {
		args = append(args, paths...)
	}
	res, err := Git(ctx, dir, args...)
	return newResult("unstage", dir, res, err)
}

// Discard throws away working-tree changes. Tracked files are restored from the
// index; untracked files are deleted outright, which is why the UI confirms it.
func Discard(ctx context.Context, dir string, paths []string, untracked bool) OpResult {
	if len(paths) == 0 {
		return OpResult{Op: "discard", Repo: dir, Kind: "nothing", Error: "no files given"}
	}
	if untracked {
		args := append([]string{"clean", "-f", "--"}, paths...)
		res, err := Git(ctx, dir, args...)
		return newResult("discard", dir, res, err)
	}
	args := append([]string{"restore", "--worktree", "--"}, paths...)
	res, err := Git(ctx, dir, args...)
	return newResult("discard", dir, res, err)
}

// Commit records the index. Nothing staged is an error git already words well.
func Commit(ctx context.Context, dir, message string, amend bool) OpResult {
	args := []string{"commit", "-m", message}
	if amend {
		args = []string{"commit", "--amend", "-m", message}
	}
	res, err := Git(ctx, dir, args...)
	return newResult("commit", dir, res, err)
}

// UndoLastCommit moves HEAD back one commit, keeping the changes staged.
func UndoLastCommit(ctx context.Context, dir string) OpResult {
	res, err := Git(ctx, dir, "reset", "--soft", "HEAD~1")
	return newResult("undo-commit", dir, res, err)
}

// LastCommitMessage is used to pre-fill the box when amending.
func LastCommitMessage(ctx context.Context, dir string) string {
	return Out(ctx, dir, "log", "-1", "--pretty=%B")
}

// Stash is one entry of `git stash list`.
type Stash struct {
	Ref     string `json:"ref"`
	Subject string `json:"subject"`
	Age     string `json:"age"`
}

// ListStashes returns the stash stack, newest first.
func ListStashes(ctx context.Context, dir string) []Stash {
	out := Out(ctx, dir, "stash", "list", "--pretty=%gd%x1f%gs%x1f%cr")
	var list []Stash
	for _, line := range Lines(out) {
		parts := strings.Split(line, "\x1f")
		if len(parts) != 3 {
			continue
		}
		list = append(list, Stash{Ref: parts[0], Subject: parts[1], Age: parts[2]})
	}
	return list
}

// PushStash stashes the working tree. Untracked files are only included when
// asked for, since sweeping them away by surprise is how work gets lost.
func PushStash(ctx context.Context, dir, message string, includeUntracked bool) OpResult {
	args := []string{"stash", "push"}
	if includeUntracked {
		args = append(args, "--include-untracked")
	}
	if strings.TrimSpace(message) != "" {
		args = append(args, "-m", message)
	}
	res, err := Git(ctx, dir, args...)
	return newResult("stash", dir, res, err)
}

// StashAction applies, pops or drops one stash entry.
func StashAction(ctx context.Context, dir, action, ref string) OpResult {
	switch action {
	case "apply", "pop", "drop":
	default:
		return OpResult{Op: "stash", Repo: dir, Kind: "generic", Error: "unknown stash action: " + action}
	}
	if ref == "" {
		return OpResult{Op: "stash", Repo: dir, Kind: "generic", Error: "no stash given"}
	}
	res, err := Git(ctx, dir, "stash", action, ref)
	return newResult("stash-"+action, dir, res, err)
}
