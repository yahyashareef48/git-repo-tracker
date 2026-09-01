package update

import "testing"

func TestNewer(t *testing.T) {
	cases := []struct {
		a, b string
		want bool
	}{
		{"0.2.0", "0.1.0", true},
		{"1.0.0", "0.9.9", true},
		{"0.1.1", "0.1.0", true},
		{"0.1.0", "0.1.0", false},
		{"0.1.0", "0.2.0", false},
		// Shorter versions pad with zeros rather than compare as smaller.
		{"1.2", "1.2.0", false},
		{"1.2.1", "1.2", true},
		// A dev build is never behind: nagging while developing is noise.
		{"9.9.9", "dev", false},
		// Unparseable tags must never trigger a "downgrade to this" prompt.
		{"latest", "0.1.0", false},
		{"", "0.1.0", false},
		{"0.1.0", "", false},
		// Pre-release and build suffixes are ignored for ordering.
		{"0.2.0-rc1", "0.1.0", true},
		{"0.1.0+build7", "0.1.0", false},
	}
	for _, c := range cases {
		if got := Newer(c.a, c.b); got != c.want {
			t.Errorf("Newer(%q, %q) = %v, want %v", c.a, c.b, got, c.want)
		}
	}
}
