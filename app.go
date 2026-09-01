package main

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"gitdeck/internal/github"
	"gitdeck/internal/gitx"
	"gitdeck/internal/store"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App is the bound API surface. Every method here is callable from the
// frontend; nothing else is.
type App struct {
	ctx   context.Context
	store *store.Store
	// storeErr is surfaced to the UI rather than crashing at startup.
	storeErr string
}

// RepoView is one row of the repo list: the tracked entry, its status, and any
// linked worktrees rendered as children.
type RepoView struct {
	Path      string        `json:"path"`
	Name      string        `json:"name"`
	Pinned    bool          `json:"pinned"`
	Group     string        `json:"group"`
	Status    gitx.Status   `json:"status"`
	Worktrees []gitx.Status `json:"worktrees"`
}

// Env reports which external tools are available, so the UI can explain a
// missing dependency instead of failing mysteriously.
type Env struct {
	GitFound   bool   `json:"gitFound"`
	GitVersion string `json:"gitVersion"`
	StoreFile  string `json:"storeFile"`
	StoreError string `json:"storeError"`
}

func NewApp() *App {
	a := &App{}
	s, err := store.New()
	if err != nil {
		a.storeErr = err.Error()
		return a
	}
	a.store = s
	return a
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// context returns a usable context even before startup has run.
func (a *App) context() context.Context {
	if a.ctx != nil {
		return a.ctx
	}
	return context.Background()
}

var errNoStore = errors.New("settings file could not be opened; check %APPDATA%\\GitDeck")

// GetEnv reports the availability of the tools the app shells out to.
func (a *App) GetEnv() Env {
	e := Env{StoreError: a.storeErr}
	if a.store != nil {
		e.StoreFile = a.store.File()
	}
	if v := gitx.Out(a.context(), "", "--version"); v != "" {
		e.GitFound = true
		e.GitVersion = strings.TrimPrefix(v, "git version ")
	}
	return e
}

// ListRepos returns every tracked repo with fresh status. Repos are read
// concurrently: ten repos on a cold cache is otherwise a visible stall.
func (a *App) ListRepos() []RepoView {
	if a.store == nil {
		return nil
	}
	entries := a.store.List()
	views := make([]RepoView, len(entries))

	var wg sync.WaitGroup
	// Bound concurrency: spawning one git per repo is fine, spawning fifty
	// at once on a laptop is not.
	sem := make(chan struct{}, 12)

	for i, e := range entries {
		wg.Add(1)
		go func(i int, e store.Entry) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			views[i] = a.buildView(e)
		}(i, e)
	}
	wg.Wait()

	// Pinned first, then the user's stored order.
	sort.SliceStable(views, func(i, j int) bool {
		return views[i].Pinned && !views[j].Pinned
	})
	return views
}

func (a *App) buildView(e store.Entry) RepoView {
	ctx := a.context()
	v := RepoView{Path: e.Path, Name: e.Name, Pinned: e.Pinned, Group: e.Group}

	if _, err := os.Stat(e.Path); err != nil {
		v.Status = gitx.Status{Path: e.Path, Name: e.Name, Error: "folder is missing"}
		return v
	}

	v.Status = gitx.GetStatus(ctx, e.Path)
	if v.Status.Name != "" {
		v.Name = v.Status.Name
	}

	for _, wt := range gitx.ListWorktrees(ctx, e.Path) {
		if wt.IsMain || sameDir(wt.Path, e.Path) {
			continue
		}
		if _, err := os.Stat(wt.Path); err != nil {
			continue
		}
		v.Worktrees = append(v.Worktrees, gitx.GetStatus(ctx, wt.Path))
	}
	return v
}

// GetRepo returns fresh status for a single repo, for targeted refreshes.
func (a *App) GetRepo(path string) RepoView {
	return a.buildView(store.Entry{Path: path, Name: filepath.Base(path)})
}

// ChooseFolder opens the native folder picker and returns the chosen path, or
// "" if the user cancelled.
func (a *App) ChooseFolder(title string) (string, error) {
	if title == "" {
		title = "Select a folder"
	}
	return runtime.OpenDirectoryDialog(a.context(), runtime.OpenDialogOptions{
		Title: title,
	})
}

// AddRepo tracks the repo at path. It rejects anything that is not a git
// working tree, and silently succeeds if the repo is already tracked.
func (a *App) AddRepo(path string) error {
	if a.store == nil {
		return errNoStore
	}
	if path == "" {
		return errors.New("no folder selected")
	}
	ctx := a.context()
	if !gitx.IsRepo(ctx, path) {
		return errors.New(filepath.Base(path) + " is not a git repository")
	}
	root := gitx.Root(ctx, path)
	if root == "" {
		root = path
	}
	return a.store.Add(root, filepath.Base(root))
}

// AddRepos tracks many paths at once, returning the paths that failed.
func (a *App) AddRepos(paths []string) []string {
	var failed []string
	for _, p := range paths {
		if err := a.AddRepo(p); err != nil {
			failed = append(failed, p+": "+err.Error())
		}
	}
	return failed
}

// RemoveRepo untracks a repo. It never deletes anything from disk.
func (a *App) RemoveRepo(path string) error {
	if a.store == nil {
		return errNoStore
	}
	return a.store.Remove(path)
}

// SetPinned pins or unpins a repo.
func (a *App) SetPinned(path string, pinned bool) error {
	if a.store == nil {
		return errNoStore
	}
	return a.store.SetPinned(path, pinned)
}

// SetGroup moves a repo into a named group. An empty name ungroups it.
func (a *App) SetGroup(path, group string) error {
	if a.store == nil {
		return errNoStore
	}
	return a.store.SetGroup(path, group)
}

// ListGroups returns every group name currently in use.
func (a *App) ListGroups() []string {
	if a.store == nil {
		return nil
	}
	return a.store.Groups()
}

// Reorder persists a new repo ordering.
func (a *App) Reorder(paths []string) error {
	if a.store == nil {
		return errNoStore
	}
	return a.store.Reorder(paths)
}

// ScanResult is one candidate from a folder scan.
type ScanResult struct {
	Path    string `json:"path"`
	Name    string `json:"name"`
	Branch  string `json:"branch"`
	Tracked bool   `json:"tracked"`
}

// ScanFolder finds every git repo under root and reports which are already
// tracked, so the UI can preselect only the new ones.
func (a *App) ScanFolder(root string, maxDepth int) []ScanResult {
	if root == "" {
		return nil
	}
	ctx := a.context()
	found := gitx.Scan(ctx, root, maxDepth)

	results := make([]ScanResult, len(found))
	var wg sync.WaitGroup
	sem := make(chan struct{}, 12)

	for i, f := range found {
		wg.Add(1)
		go func(i int, f gitx.Found) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			r := ScanResult{Path: f.Path, Name: f.Name}
			if a.store != nil {
				r.Tracked = a.store.Has(f.Path)
			}
			r.Branch = gitx.Out(ctx, f.Path, "rev-parse", "--abbrev-ref", "HEAD")
			results[i] = r
		}(i, f)
	}
	wg.Wait()
	return results
}

// RunOp performs one git operation against one repo and returns every command
// it ran. A single entry point keeps the bound surface small and gives the log
// drawer a uniform shape to render.
//
// Ops that can diverge are offered as separate names rather than a flag, so the
// UI can present "merge instead" / "rebase instead" after a failed fast-forward
// without inventing state.
func (a *App) RunOp(op, path string) []gitx.OpResult {
	ctx := a.context()
	if path == "" {
		return []gitx.OpResult{{Op: op, Error: "no repository", Kind: "generic"}}
	}

	rebaseMain := false
	if a.store != nil {
		rebaseMain = a.store.Settings().PullFromMainRebase
	}

	switch op {
	case "fetch":
		return []gitx.OpResult{gitx.Fetch(ctx, path)}
	case "pull":
		return []gitx.OpResult{gitx.Pull(ctx, path, gitx.PullFF)}
	case "pull-merge":
		return []gitx.OpResult{gitx.Pull(ctx, path, gitx.PullMerge)}
	case "pull-rebase":
		return []gitx.OpResult{gitx.Pull(ctx, path, gitx.PullRebase)}
	case "push":
		return []gitx.OpResult{gitx.Push(ctx, path)}
	case "publish":
		return []gitx.OpResult{gitx.PublishBranch(ctx, path)}
	case "sync":
		return gitx.Sync(ctx, path, gitx.PullFF)
	case "pull-from-main":
		return gitx.PullFromMain(ctx, path, rebaseMain)
	default:
		return []gitx.OpResult{{Op: op, Error: "unknown operation: " + op, Kind: "generic"}}
	}
}

// CheckGitHub probes whether GitHub is usable right now. The frontend calls
// this on launch, on a timer and on demand; it is deliberately not cached in Go
// so a manual retry always reflects reality rather than a stale answer.
func (a *App) CheckGitHub() github.Health {
	return github.Check(a.context())
}

// CopyToClipboard puts text on the clipboard, for the "run this yourself"
// affordances. GitDeck never types credentials on the user's behalf.
func (a *App) CopyToClipboard(text string) error {
	return runtime.ClipboardSetText(a.context(), text)
}

// GetSettings returns the persisted settings.
func (a *App) GetSettings() store.Settings {
	if a.store == nil {
		return store.Settings{AutoFetchMinutes: 5, AutoFetchEnabled: true}
	}
	return a.store.Settings()
}

// SaveSettings persists the settings.
func (a *App) SaveSettings(s store.Settings) error {
	if a.store == nil {
		return errNoStore
	}
	return a.store.SaveSettings(s)
}

// OpenIn launches an external tool against a repo path. Anything not in the
// allow-list is refused rather than passed to the shell.
func (a *App) OpenIn(target, path string) error {
	if path == "" {
		return errors.New("no path")
	}
	switch target {
	case "explorer":
		return exec.Command("explorer", path).Start()
	case "vscode":
		c := exec.Command("cmd", "/c", "code", path)
		return c.Start()
	case "terminal":
		c := exec.Command("cmd", "/c", "start", "", "wt", "-d", path)
		if err := c.Start(); err != nil {
			return exec.Command("cmd", "/c", "start", "", "powershell", "-NoExit", "-Command", "Set-Location -LiteralPath '"+path+"'").Start()
		}
		return nil
	default:
		return errors.New("unknown target: " + target)
	}
}

// OpenURL opens a link in the user's default browser.
func (a *App) OpenURL(url string) {
	if strings.HasPrefix(url, "http://") || strings.HasPrefix(url, "https://") {
		runtime.BrowserOpenURL(a.context(), url)
	}
}

func sameDir(a, b string) bool {
	return strings.EqualFold(filepath.Clean(a), filepath.Clean(b))
}
