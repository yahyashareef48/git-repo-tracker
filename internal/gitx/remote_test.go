package gitx

import "testing"

func TestWebURLFrom(t *testing.T) {
	cases := []struct {
		name, in, want string
	}{
		{"scp style", "git@github.com:owner/repo.git", "https://github.com/owner/repo"},
		{"scp style no suffix", "git@github.com:owner/repo", "https://github.com/owner/repo"},
		{"ssh scheme", "ssh://git@github.com/owner/repo.git", "https://github.com/owner/repo"},
		{"https", "https://github.com/owner/repo.git", "https://github.com/owner/repo"},
		{"https with credentials", "https://user:token@github.com/owner/repo.git", "https://github.com/owner/repo"},
		{"enterprise host", "git@git.example.com:team/thing.git", "https://git.example.com/team/thing"},
		{"local path", "C:/Users/me/mirror.git", ""},
		{"empty", "", ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := webURLFrom(c.in); got != c.want {
				t.Errorf("webURLFrom(%q) = %q, want %q", c.in, got, c.want)
			}
		})
	}
}
