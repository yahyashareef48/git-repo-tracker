package gitx

import (
	"context"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// skipDirs are never worth descending into and are expensive when deep.
var skipDirs = map[string]bool{
	"node_modules": true, "vendor": true, "target": true, "dist": true,
	"build": true, "out": true, "bin": true, "obj": true, "__pycache__": true,
	".venv": true, "venv": true, ".next": true, ".nuxt": true, ".cache": true,
	".gradle": true, ".idea": true, ".vscode": true,
}

// Found is a repository discovered by a folder scan.
type Found struct {
	Path string `json:"path"`
	Name string `json:"name"`
}

// Scan walks root looking for git working trees, at most maxDepth levels deep.
// It does not descend into a repo once found: nested repos are rare and
// worktrees are discovered separately via `git worktree list`.
func Scan(ctx context.Context, root string, maxDepth int) []Found {
	if maxDepth <= 0 {
		maxDepth = 4
	}
	var found []Found
	walk(ctx, root, 0, maxDepth, &found)

	sort.Slice(found, func(i, j int) bool {
		return strings.ToLower(found[i].Name) < strings.ToLower(found[j].Name)
	})
	return found
}

func walk(ctx context.Context, dir string, depth, maxDepth int, found *[]Found) {
	select {
	case <-ctx.Done():
		return
	default:
	}
	if depth > maxDepth {
		return
	}

	// A .git entry (dir for a normal clone, file for a linked worktree) is a
	// far cheaper test than spawning git for every directory we walk.
	if _, err := os.Stat(filepath.Join(dir, ".git")); err == nil {
		*found = append(*found, Found{Path: dir, Name: filepath.Base(dir)})
		return
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		name := e.Name()
		if skipDirs[name] || (strings.HasPrefix(name, ".") && name != ".") {
			continue
		}
		walk(ctx, filepath.Join(dir, name), depth+1, maxDepth, found)
	}
}
