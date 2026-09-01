package main

import (
	"bytes"
	"context"
	"errors"
	"image/png"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"gitdeck/internal/autostart"
	"gitdeck/internal/github"
	"gitdeck/internal/gitx"
	"gitdeck/internal/store"
	"gitdeck/internal/tray"
	"gitdeck/internal/update"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App is the bound API surface. Every method here is callable from the
// frontend; nothing else is.
type App struct {
	ctx   context.Context
	store *store.Store
	// storeErr is surfaced to the UI rather than crashing at startup.
	storeErr string
	// hidden tracks whether the window is tucked away in the tray, so the
	// tray's left click knows which way to toggle.
	hidden atomic.Bool
	// quitting distinguishes "the user chose Quit" from "the user closed the
	// window", which otherwise look identical to OnBeforeClose.
	quitting atomic.Bool
	// mini is true while the window is the compact tray panel.
	mini atomic.Bool
	// The full window's size, remembered across a trip through mini mode.
	// Size only: positions are never stored or restored, see EnterMini.
	geoMu        sync.Mutex
	fullW, fullH int
	// hasGeo is false until a genuinely full-sized window has been measured.
	hasGeo bool
	// fullMaximised remembers a maximised window, which has no meaningful
	// size or position of its own to restore.
	fullMaximised bool
	// version is stamped into the binary at build time.
	version string
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
	Version    string `json:"version"`
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
	a.startTray()

	// Launched by the Windows Run entry, or configured to start hidden: go
	// straight to the tray rather than flashing a window first.
	// Only hide once the icon is genuinely in the tray; hiding first would
	// leave no way to get the window back if the tray never appears.
	wantHidden := autostart.LaunchedMinimised() ||
		(a.store != nil && a.store.Settings().StartMinimised)
	if wantHidden && tray.WaitReady(3*time.Second) {
		a.HideWindow()
	}
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
	e := Env{StoreError: a.storeErr, Version: a.version}
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

	// The list is refreshed on launch, on focus and after every operation, so
	// this is the natural place to keep the tray honest.
	counts := trayCounts(views)
	tray.SetStatus(counts)

	// The window is frameless, but the title is still what the taskbar and
	// alt-tab show, so it carries the same summary.
	title := "GitDeck"
	if counts.Unpushed > 0 {
		title += " — " + strconv.Itoa(counts.Unpushed) + " to push"
	} else if counts.Dirty > 0 {
		title += " — " + strconv.Itoa(counts.Dirty) + " with changes"
	}
	runtime.WindowSetTitle(a.context(), title)

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
//
// The stored entry is looked up rather than synthesised: building one from the
// path alone drops the repo's group and pin, which then vanish from the list
// the moment anything refreshes a single row.
func (a *App) GetRepo(path string) RepoView {
	if a.store != nil {
		if e, ok := a.store.Get(path); ok {
			return a.buildView(e)
		}
	}
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

// CheckUpdate asks GitHub whether a newer release exists. Nothing is ever
// downloaded or installed: it reports a version and a link, and the user
// decides.
func (a *App) CheckUpdate() update.Info {
	return update.Check(a.context(), a.version, releaseRepo)
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

// RepoDetail is everything the changes panel needs in one round trip.
type RepoDetail struct {
	Path        string       `json:"path"`
	Name        string       `json:"name"`
	Status      gitx.Status  `json:"status"`
	Changes     gitx.Changes `json:"changes"`
	Stashes     []gitx.Stash `json:"stashes"`
	LastMessage string       `json:"lastMessage"`
}

// GetDetail opens one repo for editing: status, changed files and stashes.
func (a *App) GetDetail(path string) RepoDetail {
	ctx := a.context()
	d := RepoDetail{Path: path, Name: filepath.Base(path)}
	if path == "" {
		return d
	}
	d.Status = gitx.GetStatus(ctx, path)
	if d.Status.Name != "" {
		d.Name = d.Status.Name
	}
	d.Changes = gitx.GetChanges(ctx, path)
	d.Stashes = gitx.ListStashes(ctx, path)
	d.LastMessage = gitx.LastCommitMessage(ctx, path)
	return d
}

// GetDiff returns one file's unified diff.
func (a *App) GetDiff(path, file string, staged, untracked bool) gitx.Diff {
	return gitx.GetDiff(a.context(), path, file, staged, untracked)
}

// StageFiles adds files to the index; an empty list stages everything.
func (a *App) StageFiles(path string, files []string) gitx.OpResult {
	return gitx.Stage(a.context(), path, files)
}

// UnstageFiles removes files from the index.
func (a *App) UnstageFiles(path string, files []string) gitx.OpResult {
	return gitx.Unstage(a.context(), path, files)
}

// DiscardFiles throws away working-tree changes. Destructive by nature: the UI
// confirms first, and untracked files are deleted rather than restored.
func (a *App) DiscardFiles(path string, files []string, untracked bool) gitx.OpResult {
	return gitx.Discard(a.context(), path, files, untracked)
}

// CommitChanges records the index.
func (a *App) CommitChanges(path, message string, amend bool) gitx.OpResult {
	if strings.TrimSpace(message) == "" {
		return gitx.OpResult{Op: "commit", Repo: path, Kind: "nothing",
			Error: "a commit needs a message"}
	}
	return gitx.CreateCommit(a.context(), path, message, amend)
}

// UndoLastCommit moves HEAD back one, keeping the work staged.
func (a *App) UndoLastCommit(path string) gitx.OpResult {
	return gitx.UndoLastCommit(a.context(), path)
}

// StashPush stashes the working tree.
func (a *App) StashPush(path, message string, includeUntracked bool) gitx.OpResult {
	return gitx.PushStash(a.context(), path, message, includeUntracked)
}

// StashAction applies, pops or drops one stash entry.
func (a *App) StashAction(path, action, ref string) gitx.OpResult {
	return gitx.StashAction(a.context(), path, action, ref)
}

// ListBranches returns every local and remote-tracking branch.
func (a *App) ListBranches(path string) []gitx.Branch {
	return gitx.ListBranches(a.context(), path)
}

// SwitchBranch checks out an existing branch. A remote-tracking ref creates the
// matching local branch, which is what picking it from the list means.
func (a *App) SwitchBranch(path, name string, remote bool) gitx.OpResult {
	if remote {
		return gitx.CheckoutRemote(a.context(), path, name)
	}
	return gitx.Checkout(a.context(), path, name)
}

// CreateBranch makes a branch and switches to it.
func (a *App) CreateBranch(path, name, start string) gitx.OpResult {
	if strings.TrimSpace(name) == "" {
		return gitx.OpResult{Op: "checkout-new", Repo: path, Kind: "generic",
			Error: "a branch needs a name"}
	}
	return gitx.CheckoutNew(a.context(), path, strings.TrimSpace(name), start)
}

// DeleteBranch removes a local branch.
func (a *App) DeleteBranch(path, name string, force bool) gitx.OpResult {
	return gitx.DeleteBranch(a.context(), path, name, force)
}

// GetLog returns a page of commits from the current branch.
func (a *App) GetLog(path string, skip, limit int) []gitx.Commit {
	return gitx.Log(a.context(), path, skip, limit)
}

// ShowCommit returns one commit and the files it touched.
func (a *App) ShowCommit(path, sha string) gitx.CommitDetail {
	return gitx.ShowCommit(a.context(), path, sha)
}

// GetCommitDiff returns one file's diff within a commit.
func (a *App) GetCommitDiff(path, sha, file string) gitx.Diff {
	return gitx.CommitFileDiff(a.context(), path, sha, file)
}

// RepoWebURL returns the browsable https URL for a repo's remote, or "" when
// there is nothing a browser could open.
func (a *App) RepoWebURL(path string) string {
	return gitx.WebURL(a.context(), path)
}

// AddWorktree creates a linked worktree, optionally on a new branch.
func (a *App) AddWorktree(path, folder, branch string, createBranch bool) gitx.OpResult {
	return gitx.AddWorktree(a.context(), path, folder, strings.TrimSpace(branch), createBranch)
}

// RemoveWorktree detaches a linked worktree. The folder is deleted by git, so
// the UI confirms first and only forces when the user insists.
func (a *App) RemoveWorktree(path, folder string, force bool) gitx.OpResult {
	return gitx.RemoveWorktree(a.context(), path, folder, force)
}

// --- Tray and startup -------------------------------------------------------

// trayCounts summarises the tracked repos for the tray tooltip and badge.
func trayCounts(views []RepoView) tray.Status {
	s := tray.Status{Repos: len(views)}
	for _, v := range views {
		if v.Status.Ahead > 0 || (v.Status.HasRemote && v.Status.Upstream == "") {
			s.Unpushed++
		}
		if v.Status.Dirty() {
			s.Dirty++
		}
		for _, wt := range v.Worktrees {
			if wt.Ahead > 0 {
				s.Unpushed++
			}
			if wt.Dirty() {
				s.Dirty++
			}
		}
	}
	return s
}

// ShowWindow brings the window to the front from the tray.
func (a *App) ShowWindow() {
	ctx := a.context()
	runtime.WindowShow(ctx)
	runtime.WindowUnminimise(ctx)
	a.hidden.Store(false)
}

// HideWindow tucks the app back into the tray.
func (a *App) HideWindow() {
	runtime.WindowHide(a.context())
	a.hidden.Store(true)
}

// ToggleWindow is what a left click on the tray icon does.
func (a *App) ToggleWindow() {
	if a.hidden.Load() {
		a.ShowWindow()
		return
	}
	a.HideWindow()
}

// QuitApp exits for real, rather than hiding to the tray.
func (a *App) QuitApp() {
	a.quitting.Store(true)
	tray.Stop()
	runtime.Quit(a.context())
}

// GetAutostart reports whether Windows launches GitDeck at sign-in. The
// registry is the source of truth, not our settings file, so an entry removed
// through Task Manager is reflected honestly.
func (a *App) GetAutostart() bool {
	return autostart.Enabled()
}

// SetAutostart adds or removes the Windows startup entry.
func (a *App) SetAutostart(on bool) error {
	return autostart.Set(on)
}

// beforeClose keeps the app alive in the tray instead of exiting, unless the
// user picked Quit or turned the behaviour off.
func (a *App) beforeClose(ctx context.Context) bool {
	if a.quitting.Load() {
		return false
	}
	if a.store != nil && !a.store.Settings().CloseToTray {
		tray.Stop()
		return false
	}
	// Never hide with no tray icon to restore from: the app would keep running
	// invisibly with no way to bring it back or shut it down.
	if !tray.Running() {
		return false
	}
	a.HideWindow()
	return true
}

// startTray wires the notification-area icon to the app. Bulk operations are
// emitted as events rather than run here: the frontend owns what "all" means,
// since it knows the current group filter and selection.
func (a *App) startTray() {
	img, err := png.Decode(bytes.NewReader(appIconPNG))
	if err != nil {
		return
	}
	_ = tray.Start(img, tray.Callbacks{
		// Left click opens the compact panel rather than the whole app: the
		// point of the tray is a quick look, not a context switch.
		Show:   a.ExitMini,
		Toggle: a.ToggleMiniPanel,
		FetchAll: func() {
			a.ShowWindow()
			runtime.EventsEmit(a.context(), "tray:fetch-all")
		},
		SyncAll: func() {
			a.ShowWindow()
			runtime.EventsEmit(a.context(), "tray:sync-all")
		},
		Quit: a.QuitApp,
	})
}

// --- Mini panel -------------------------------------------------------------

// Wails v2 gives an app exactly one window, so the compact tray panel is this
// same window resized and pinned on top — not a second one.
const (
	miniWidth  = 400
	miniHeight = 540
	fullMinW   = 880
	fullMinH   = 560
)

// IsMini reports whether the window is currently the compact panel.
func (a *App) IsMini() bool { return a.mini.Load() }

// EnterMini shrinks the window into a tray-side panel, pinned on top.
//
// The window is resized in place — its top-left corner does not move, and no
// position is ever computed. That is deliberate. Wails reports screen sizes
// without their offsets, and this machine (like many) has a second monitor at
// a different DPI, so any absolute coordinate we calculate is in the wrong
// space and throws the window onto another display or off the desktop. Growing
// and shrinking from a corner that is already on screen cannot do that.
func (a *App) EnterMini() {
	ctx := a.context()

	// Windows ignores a resize while a window is maximised: the panel would
	// silently stay full-screen and only appear to move. Un-maximise first,
	// which also reveals the size actually worth restoring later.
	maximised := runtime.WindowIsMaximised(ctx)
	if maximised {
		runtime.WindowUnmaximise(ctx)
	}

	w, h := runtime.WindowGetSize(ctx)
	if !a.mini.Load() && w >= fullMinW && h >= fullMinH {
		// Guarded on size: after a restart the window can already be
		// panel-sized, and recording that as "full" would shrink it forever.
		a.geoMu.Lock()
		a.fullW, a.fullH = w, h
		a.hasGeo = true
		a.fullMaximised = maximised
		a.geoMu.Unlock()
	}

	// The configured minimum is far larger than the panel, so it has to be
	// relaxed before the resize will take.
	runtime.WindowSetMinSize(ctx, 320, 360)
	runtime.WindowSetSize(ctx, miniWidth, miniHeight)
	runtime.WindowSetAlwaysOnTop(ctx, true)

	a.mini.Store(true)
	a.ShowWindow()
	runtime.EventsEmit(ctx, "window:mode", "mini")
}

// ExitMini restores the full window, in place.
func (a *App) ExitMini() {
	ctx := a.context()
	runtime.WindowSetAlwaysOnTop(ctx, false)
	runtime.WindowSetMinSize(ctx, fullMinW, fullMinH)

	a.geoMu.Lock()
	w, h, maximised := a.fullW, a.fullH, a.fullMaximised
	a.geoMu.Unlock()

	if w < fullMinW || h < fullMinH {
		w, h = 1180, 780
	}
	runtime.WindowSetSize(ctx, w, h)
	if maximised {
		runtime.WindowMaximise(ctx)
	}

	a.mini.Store(false)
	a.ShowWindow()
	runtime.EventsEmit(ctx, "window:mode", "full")
}

// ToggleMiniPanel is what a left click on the tray icon does: show the panel,
// or put it away if it is already the thing on screen.
func (a *App) ToggleMiniPanel() {
	if a.mini.Load() && !a.hidden.Load() {
		a.HideWindow()
		return
	}
	a.EnterMini()
}
