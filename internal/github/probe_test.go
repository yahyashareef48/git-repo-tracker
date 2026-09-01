package github

import "testing"

// Real `gh auth status` output, including the case that used to be misread:
// a broken secondary host makes gh exit non-zero while github.com is fine.
const multiHost = `nonexistent.invalid
  X Failed to log in to nonexistent.invalid using token (default)
  - Active account: true
  - The token in default is invalid.

github.com
  ✓ Logged in to github.com account yahyashareef48 (keyring)
  - Active account: true
  - Git operations protocol: https
  - Token: gho_************************************
  - Token scopes: 'gist', 'project', 'read:org', 'repo', 'workflow'
`

const enterpriseFirst = `github.example.com
  ✓ Logged in to github.example.com account work-account (oauth_token)

github.com
  ✓ Logged in to github.com account personal-account (keyring)
  - Token scopes: 'repo'
`

func TestParseAccountPrefersGitHubDotCom(t *testing.T) {
	cases := []struct {
		name, in, want string
	}{
		{"broken secondary host", multiHost, "yahyashareef48"},
		{"enterprise host listed first", enterpriseFirst, "personal-account"},
		{"nothing logged in", "You are not logged into any GitHub hosts.", "GitHub"},
		{"empty", "", "GitHub"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := parseAccount(c.in); got != c.want {
				t.Errorf("parseAccount() = %q, want %q", got, c.want)
			}
		})
	}
}

func TestParseScopes(t *testing.T) {
	want := "'gist', 'project', 'read:org', 'repo', 'workflow'"
	if got := parseScopes(multiHost); got != want {
		t.Errorf("parseScopes() = %q, want %q", got, want)
	}
	if got := parseScopes("no scopes here"); got != "" {
		t.Errorf("parseScopes() = %q, want empty", got)
	}
}
