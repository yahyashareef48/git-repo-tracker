// Package github reports whether GitHub is usable right now, so the UI can say
// so plainly instead of letting every push fail one at a time.
package github

import (
	"context"
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"gitdeck/internal/gitx"
)

// State is the single value the UI switches on.
type State string

const (
	// StateConnected means authenticated and github.com answered.
	StateConnected State = "connected"
	// StateDegraded means authenticated, but the reachability probe failed or
	// the rate limit is nearly spent. Remote ops may work; they may not.
	StateDegraded State = "degraded"
	// StateOffline means github.com could not be reached at all.
	StateOffline State = "offline"
	// StateNoAuth means the CLI is installed but nobody is signed in.
	StateNoAuth State = "noauth"
	// StateNoCLI means the gh CLI is not installed.
	StateNoCLI State = "nocli"
)

// Health is the result of one probe.
type Health struct {
	State     State  `json:"state"`
	CLIFound  bool   `json:"cliFound"`
	Version   string `json:"version"`
	Authed    bool   `json:"authed"`
	Account   string `json:"account"`
	Scopes    string `json:"scopes"`
	Reachable bool   `json:"reachable"`
	RateLimit int    `json:"rateLimit"`
	RateLeft  int    `json:"rateLeft"`
	// Message is a short, plain explanation of the current state.
	Message string `json:"message"`
	// Detail carries the underlying stderr, for the log drawer.
	Detail    string `json:"detail"`
	CheckedAt string `json:"checkedAt"`
}

// RemoteOK reports whether remote git operations are worth attempting.
func (h Health) RemoteOK() bool {
	return h.State == StateConnected || h.State == StateDegraded
}

const (
	cliTimeout  = 5 * time.Second
	netTimeout  = 6 * time.Second
	lowRateWarn = 100
)

// Check runs the three-stage probe: is the CLI there, is anyone signed in, and
// does github.com actually answer right now. Each stage is only run when the
// previous one makes it meaningful.
func Check(ctx context.Context) Health {
	h := Health{CheckedAt: time.Now().Format("15:04:05")}

	// 1. Is the CLI installed at all?
	res, err := gitx.Run(ctx, "", "gh", cliTimeout, "--version")
	if err != nil || res.Stdout == "" {
		h.State = StateNoCLI
		h.Message = "GitHub CLI (gh) is not installed. Push, pull and sync over HTTPS may still work if git has your credentials, but GitDeck cannot check GitHub's status."
		h.Detail = res.Stderr
		return h
	}
	h.CLIFound = true
	h.Version = firstLine(res.Stdout)

	// 2. Is anybody signed in? gh writes this to stderr on most versions, so
	// both streams are considered.
	//
	// The exit code is deliberately ignored: `gh auth status` exits non-zero
	// when ANY configured host fails, even while github.com itself is signed
	// in perfectly well. Only the text can tell those two apart.
	res, _ = gitx.Run(ctx, "", "gh", cliTimeout, "auth", "status")
	combined := res.Stdout + "\n" + res.Stderr
	if !strings.Contains(combined, "Logged in to") {
		h.State = StateNoAuth
		h.Message = "You are not signed in to GitHub. Run `gh auth login` once, then retry."
		h.Detail = strings.TrimSpace(combined)
		return h
	}
	h.Authed = true
	h.Account = parseAccount(combined)
	h.Scopes = parseScopes(combined)

	// 3. Does github.com answer? rate_limit is the cheapest authenticated call
	// and it does not count against the limit it reports.
	res, err = gitx.Run(ctx, "", "gh", netTimeout, "api", "rate_limit")
	if err != nil {
		h.State = StateOffline
		h.Message = "GitHub could not be reached. Fetch, pull and push will fail until the connection is back."
		h.Detail = res.Stderr
		return h
	}
	h.Reachable = true

	var payload struct {
		Rate struct {
			Limit     int `json:"limit"`
			Remaining int `json:"remaining"`
		} `json:"rate"`
	}
	if json.Unmarshal([]byte(res.Stdout), &payload) == nil {
		h.RateLimit = payload.Rate.Limit
		h.RateLeft = payload.Rate.Remaining
	}

	if h.RateLimit > 0 && h.RateLeft <= lowRateWarn {
		h.State = StateDegraded
		h.Message = "GitHub API rate limit is nearly spent (" +
			strconv.Itoa(h.RateLeft) + " of " + strconv.Itoa(h.RateLimit) + " left)."
		return h
	}

	h.State = StateConnected
	h.Message = "Connected as " + h.Account
	return h
}

// parseAccount pulls the username out of `gh auth status`. github.com wins
// when several hosts are configured, since that is the one GitDeck cares about.
func parseAccount(s string) string {
	fallback := ""
	for _, line := range gitx.Lines(s) {
		if !strings.Contains(line, "Logged in to") {
			continue
		}
		i := strings.Index(line, "account ")
		if i < 0 {
			continue
		}
		name := strings.TrimSpace(line[i+len("account "):])
		if j := strings.IndexAny(name, " ("); j > 0 {
			name = name[:j]
		}
		if name == "" {
			continue
		}
		if strings.Contains(line, "github.com") {
			return name
		}
		if fallback == "" {
			fallback = name
		}
	}
	if fallback != "" {
		return fallback
	}
	return "GitHub"
}

func parseScopes(s string) string {
	for _, line := range gitx.Lines(s) {
		if i := strings.Index(line, "Token scopes:"); i >= 0 {
			return strings.TrimSpace(line[i+len("Token scopes:"):])
		}
	}
	return ""
}

func firstLine(s string) string {
	if lines := gitx.Lines(s); len(lines) > 0 {
		return lines[0]
	}
	return ""
}
