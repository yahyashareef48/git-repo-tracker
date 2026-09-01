package gitx

import (
	"context"
	"strconv"
	"strings"
)

// Branch is one ref, local or remote-tracking.
type Branch struct {
	Name     string `json:"name"`
	Upstream string `json:"upstream"`
	Ahead    int    `json:"ahead"`
	Behind   int    `json:"behind"`
	Current  bool   `json:"current"`
	Remote   bool   `json:"remote"`
	Subject  string `json:"subject"`
	Age      string `json:"age"`
	Sha      string `json:"sha"`
	// CheckedOut names the worktree holding this branch, if another one does.
	// git refuses to check out a branch that is already checked out elsewhere,
	// so the UI needs to say why up front.
	CheckedOut string `json:"checkedOut"`
}

const branchFormat = "%(refname:short)%1f%(upstream:short)%1f%(upstream:track)%1f" +
	"%(HEAD)%1f%(objectname:short)%1f%(contents:subject)%1f%(committerdate:relative)%1f" +
	"%(worktreepath)%1f%(symref)"

// ListBranches returns local branches first, then remote-tracking ones, each
// group ordered by most recent commit.
func ListBranches(ctx context.Context, dir string) []Branch {
	out := Out(ctx, dir, "for-each-ref",
		"--sort=-committerdate",
		"--format="+branchFormat,
		"refs/heads", "refs/remotes")

	// Read the remotes once: a local branch may legitimately be called
	// "feature/x", so only a configured remote's prefix proves a ref is remote.
	remotes := Lines(Out(ctx, dir, "remote"))

	var branches []Branch
	for _, line := range Lines(out) {
		f := strings.Split(line, "\x1f")
		if len(f) < 9 || f[0] == "" {
			continue
		}
		// refs/remotes/origin/HEAD is a symbolic alias, not a branch — and git
		// shortens its name to a bare "origin", so it cannot be recognised by
		// name at all. A non-empty %(symref) is the reliable test.
		if f[8] != "" {
			continue
		}

		b := Branch{
			Name:       f[0],
			Upstream:   f[1],
			Current:    f[3] == "*",
			Sha:        f[4],
			Subject:    f[5],
			Age:        f[6],
			CheckedOut: f[7],
			Remote:     hasRemotePrefix(f[0], remotes),
		}
		b.Ahead, b.Behind = parseTrack(f[2])
		branches = append(branches, b)
	}
	return branches
}

// hasRemotePrefix reports whether a short ref name belongs to one of the
// configured remotes.
func hasRemotePrefix(name string, remotes []string) bool {
	for _, r := range remotes {
		if strings.HasPrefix(name, r+"/") {
			return true
		}
	}
	return false
}

// parseTrack reads git's "[ahead 2, behind 1]" tracking summary.
func parseTrack(s string) (ahead, behind int) {
	s = strings.Trim(s, "[]")
	for _, part := range strings.Split(s, ",") {
		part = strings.TrimSpace(part)
		switch {
		case strings.HasPrefix(part, "ahead "):
			ahead, _ = strconv.Atoi(strings.TrimPrefix(part, "ahead "))
		case strings.HasPrefix(part, "behind "):
			behind, _ = strconv.Atoi(strings.TrimPrefix(part, "behind "))
		}
	}
	return
}

// Checkout switches to an existing branch.
func Checkout(ctx context.Context, dir, name string) OpResult {
	res, err := Git(ctx, dir, "checkout", name)
	return newResult("checkout", dir, res, err)
}

// CheckoutNew creates a branch and switches to it. start may be empty to branch
// from the current HEAD, or a branch/commit to branch from.
func CheckoutNew(ctx context.Context, dir, name, start string) OpResult {
	args := []string{"checkout", "-b", name}
	if start != "" {
		args = append(args, start)
	}
	res, err := Git(ctx, dir, args...)
	return newResult("checkout-new", dir, res, err)
}

// CheckoutRemote creates a local branch tracking a remote one. Given
// "origin/feat/x" it makes "feat/x", which is what checking out a remote
// branch means in every git UI.
func CheckoutRemote(ctx context.Context, dir, remoteRef string) OpResult {
	local := remoteRef
	if i := strings.Index(remoteRef, "/"); i >= 0 {
		local = remoteRef[i+1:]
	}
	// If the local branch already exists, just switch to it.
	if Out(ctx, dir, "rev-parse", "--verify", "--quiet", "refs/heads/"+local) != "" {
		return Checkout(ctx, dir, local)
	}
	res, err := Git(ctx, dir, "checkout", "-b", local, "--track", remoteRef)
	return newResult("checkout-remote", dir, res, err)
}

// DeleteBranch removes a local branch. Without force git refuses to delete
// anything unmerged, which is the safety we want by default.
func DeleteBranch(ctx context.Context, dir, name string, force bool) OpResult {
	flag := "-d"
	if force {
		flag = "-D"
	}
	res, err := Git(ctx, dir, "branch", flag, name)
	return newResult("delete-branch", dir, res, err)
}
