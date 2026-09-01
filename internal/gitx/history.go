package gitx

import (
	"context"
	"strconv"
	"strings"
)

// Commit is one entry of the log.
type Commit struct {
	Sha     string `json:"sha"`
	Short   string `json:"short"`
	Subject string `json:"subject"`
	Body    string `json:"body"`
	Author  string `json:"author"`
	Email   string `json:"email"`
	Age     string `json:"age"`
	Date    string `json:"date"`
	// Refs is git's decoration: branch and tag names pointing at this commit.
	Refs string `json:"refs"`
	// Parents lets the UI mark merge commits.
	Parents int `json:"parents"`
}

// logFormat uses unit separators between fields and a record separator between
// commits, so a subject containing newlines or tabs cannot break parsing.
const logFormat = "%H%x1f%h%x1f%s%x1f%an%x1f%ae%x1f%cr%x1f%cI%x1f%D%x1f%p%x1e"

// Log returns commits reachable from HEAD, newest first.
func Log(ctx context.Context, dir string, skip, limit int) []Commit {
	if limit <= 0 {
		limit = 50
	}
	args := []string{"log", "--max-count=" + strconv.Itoa(limit), "--format=" + logFormat}
	if skip > 0 {
		args = append(args, "--skip="+strconv.Itoa(skip))
	}

	res, err := Git(ctx, dir, args...)
	if err != nil {
		return nil
	}

	var out []Commit
	for _, record := range strings.Split(res.Stdout, "\x1e") {
		record = strings.TrimLeft(record, "\r\n")
		if record == "" {
			continue
		}
		f := strings.Split(record, "\x1f")
		if len(f) < 9 {
			continue
		}
		out = append(out, Commit{
			Sha: f[0], Short: f[1], Subject: f[2],
			Author: f[3], Email: f[4], Age: f[5], Date: f[6], Refs: f[7],
			Parents: len(strings.Fields(f[8])),
		})
	}
	return out
}

// CommitDetail is one commit plus the files it touched.
type CommitDetail struct {
	Commit Commit   `json:"commit"`
	Files  []Change `json:"files"`
	Error  string   `json:"error"`
}

// ShowCommit lists the files a commit changed. The diffs themselves are fetched
// per file, so opening a 500-file commit stays cheap.
func ShowCommit(ctx context.Context, dir, sha string) CommitDetail {
	var d CommitDetail
	if sha == "" {
		d.Error = "no commit given"
		return d
	}

	res, err := Git(ctx, dir, "show", "--no-patch", "--format="+logFormat, sha)
	if err != nil {
		d.Error = firstLine(res.Stderr)
		return d
	}
	if commits := parseOne(res.Stdout); commits != nil {
		d.Commit = *commits
	}
	d.Commit.Body = Out(ctx, dir, "show", "--no-patch", "--format=%b", sha)

	// -z keeps odd filenames intact; -M detects renames.
	res, err = Git(ctx, dir, "show", "--name-status", "--format=", "-M", "-z", sha)
	if err != nil {
		d.Error = firstLine(res.Stderr)
		return d
	}
	d.Files = parseNameStatus(res.Stdout)
	return d
}

func parseOne(stdout string) *Commit {
	for _, record := range strings.Split(stdout, "\x1e") {
		record = strings.TrimLeft(record, "\r\n")
		if record == "" {
			continue
		}
		f := strings.Split(record, "\x1f")
		if len(f) < 9 {
			continue
		}
		return &Commit{
			Sha: f[0], Short: f[1], Subject: f[2],
			Author: f[3], Email: f[4], Age: f[5], Date: f[6], Refs: f[7],
			Parents: len(strings.Fields(f[8])),
		}
	}
	return nil
}

// parseNameStatus reads `--name-status -z`, where a status letter and its path
// are separate NUL-terminated fields and a rename carries two paths.
func parseNameStatus(stdout string) []Change {
	fields := strings.Split(stdout, "\x00")
	var out []Change

	for i := 0; i < len(fields); i++ {
		code := strings.TrimSpace(fields[i])
		if code == "" {
			continue
		}
		letter := code[0]

		if (letter == 'R' || letter == 'C') && i+2 < len(fields) {
			out = append(out, Change{
				Orig: fields[i+1], Path: fields[i+2],
				Kind: kindOf(letter), Code: string(letter),
			})
			i += 2
			continue
		}
		if i+1 < len(fields) {
			out = append(out, Change{
				Path: fields[i+1], Kind: kindOf(letter), Code: string(letter),
			})
			i++
		}
	}
	return out
}

// CommitFileDiff returns one file's diff within a commit.
func CommitFileDiff(ctx context.Context, dir, sha, path string) Diff {
	d := Diff{Path: path}
	if sha == "" || path == "" {
		d.Error = "no commit or file given"
		return d
	}

	res, err := Git(ctx, dir, "show", "--no-color", "--no-ext-diff", "-U3", "-M",
		"--format=", sha, "--", path)
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
