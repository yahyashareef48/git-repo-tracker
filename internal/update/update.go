// Package update checks GitHub releases for a newer GitDeck.
//
// The check goes through the gh CLI rather than a plain HTTPS request so it
// works against a private repository using the credentials the user has
// already set up — the same ones every other remote operation relies on. It
// never downloads or installs anything; a release page and a version number
// are all it produces.
package update

import (
	"context"
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"gitdeck/internal/gitx"
)

// Info is the outcome of a check.
type Info struct {
	Current   string `json:"current"`
	Latest    string `json:"latest"`
	Available bool   `json:"available"`
	URL       string `json:"url"`
	Notes     string `json:"notes"`
	Published string `json:"published"`
	Error     string `json:"error"`
	CheckedAt string `json:"checkedAt"`
}

const timeout = 10 * time.Second

// Check asks GitHub for the newest release of repo ("owner/name") and compares
// it with the running version.
func Check(ctx context.Context, current, repo string) Info {
	info := Info{Current: current, CheckedAt: time.Now().Format("15:04:05")}
	if repo == "" {
		info.Error = "no release repository configured"
		return info
	}

	res, err := gitx.Run(ctx, "", "gh", timeout, "api", "repos/"+repo+"/releases/latest")
	if err != nil {
		// A repo with no releases yet answers 404, which is not a failure worth
		// alarming anyone about.
		if strings.Contains(res.Stderr, "Not Found") {
			info.Latest = current
			return info
		}
		info.Error = firstLine(res.Stderr)
		if info.Error == "" {
			info.Error = err.Error()
		}
		return info
	}

	var payload struct {
		TagName     string `json:"tag_name"`
		HTMLURL     string `json:"html_url"`
		Body        string `json:"body"`
		PublishedAt string `json:"published_at"`
		Draft       bool   `json:"draft"`
		Prerelease  bool   `json:"prerelease"`
	}
	if err := json.Unmarshal([]byte(res.Stdout), &payload); err != nil {
		info.Error = "could not read the release information"
		return info
	}
	if payload.Draft || payload.Prerelease {
		info.Latest = current
		return info
	}

	info.Latest = strings.TrimPrefix(payload.TagName, "v")
	info.URL = payload.HTMLURL
	info.Notes = payload.Body
	if len(payload.PublishedAt) >= 10 {
		info.Published = payload.PublishedAt[:10]
	}
	info.Available = Newer(info.Latest, current)
	return info
}

// Newer reports whether a is a higher version than b. Both are dotted numeric
// versions; anything unparseable compares as not newer, so a malformed tag can
// never nag the user into a downgrade.
func Newer(a, b string) bool {
	if a == "" || b == "" || b == "dev" {
		// A dev build is always "current": it is ahead of any release by
		// definition, and nagging while developing is noise.
		return false
	}
	pa, pb := parts(a), parts(b)
	for i := 0; i < len(pa) || i < len(pb); i++ {
		x, y := at(pa, i), at(pb, i)
		if x != y {
			return x > y
		}
	}
	return false
}

func parts(v string) []int {
	// Drop any build or pre-release suffix: 1.2.3-rc1+build → 1.2.3
	if i := strings.IndexAny(v, "-+"); i >= 0 {
		v = v[:i]
	}
	var out []int
	for _, f := range strings.Split(v, ".") {
		n, err := strconv.Atoi(strings.TrimSpace(f))
		if err != nil {
			return nil
		}
		out = append(out, n)
	}
	return out
}

func at(v []int, i int) int {
	if i < len(v) {
		return v[i]
	}
	return 0
}

func firstLine(s string) string {
	if lines := gitx.Lines(s); len(lines) > 0 {
		return lines[0]
	}
	return ""
}
