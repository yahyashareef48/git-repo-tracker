package gitx

import (
	"context"
	"net/url"
	"strings"
)

// WebURL turns a repo's remote into a browsable https URL, or returns "" when
// the remote is not something a browser can open.
//
// git remotes come in several shapes for the same host — scp-style
// (git@host:owner/repo.git), ssh:// and https:// — and only the last is a URL
// a browser understands, so the others are rewritten.
func WebURL(ctx context.Context, dir string) string {
	remote := firstRemote(ctx, dir)
	if remote == "" {
		return ""
	}
	raw := Out(ctx, dir, "remote", "get-url", remote)
	return webURLFrom(raw)
}

func webURLFrom(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	raw = strings.TrimSuffix(raw, ".git")

	switch {
	case strings.HasPrefix(raw, "https://"), strings.HasPrefix(raw, "http://"):
		// Strip any embedded credentials before handing the URL to a browser.
		if u, err := url.Parse(raw); err == nil {
			u.User = nil
			return u.String()
		}
		return raw

	case strings.HasPrefix(raw, "ssh://"):
		if u, err := url.Parse(raw); err == nil {
			return "https://" + u.Host + u.Path
		}
		return ""

	case strings.Contains(raw, "@") && strings.Contains(raw, ":"):
		// scp-style: git@github.com:owner/repo
		at := strings.Index(raw, "@")
		colon := strings.Index(raw[at:], ":")
		if colon < 0 {
			return ""
		}
		host := raw[at+1 : at+colon]
		path := strings.TrimPrefix(raw[at+colon+1:], "/")
		if host == "" || path == "" {
			return ""
		}
		return "https://" + host + "/" + path
	}
	return ""
}
