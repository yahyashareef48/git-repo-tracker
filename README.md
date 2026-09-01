# GitDeck

A Windows desktop app that tracks every local git repository you care about and
gives you what the VS Code Git panel gives you — sync, pull, push, pull from
main, branches, staging, stashes, history, worktrees — from one window, plus a
tray panel for a glance without switching context.

Built with [Wails v2](https://wails.io): a Go core and a React frontend rendered
by the WebView2 already on your machine. The result is a ~12 MB exe, not a
bundled browser.

---

## What it does

**Tracking**
- Add a repository, or point it at a folder and let it find every repo underneath
- Group repositories (`perfai`, `personal`, …) and filter by group
- Tick individual repos to build an ad-hoc set, then act on just those
- Drag rows to reorder; pin the ones you live in
- Linked worktrees nest under their repo, collapsible, and remember what was open

**Git**
- One contextual button per row: Publish, Pull, Push or Sync, whichever the repo
  actually needs
- Fetch, pull, push, sync, pull-from-main, publish branch — per repo or in bulk
- Stage, unstage, discard, commit, amend, undo last commit
- Stash push, apply, pop, drop
- A unified diff with both line-number gutters, for the working tree and for any
  commit in the history
- Branch picker: search, create as you type, delete, and a lock on branches
  another worktree already holds
- Create and remove worktrees

**Knowing when it will not work**
- A three-stage GitHub probe — is `gh` installed, is anyone signed in, does
  github.com answer — running on launch, on focus and every minute
- When GitHub is unreachable every remote action is disabled with a tooltip
  saying why; local work stays available
- Every git command it runs, and that command's real output, is in the log drawer

**Staying out of the way**
- Tray icon with a badge when something is unpushed; left click opens a compact
  panel scoped to the repos or group you choose
- Close to tray, start with Windows, start minimised
- Background fetch on an interval you set, skipped whenever GitHub is down

GitDeck never handles your credentials. Every git and `gh` call runs with
`GIT_TERMINAL_PROMPT=0` and no editor, so it fails with a clear message instead
of hanging on a prompt you cannot see. Signing in is `gh auth login`, in your own
terminal.

---

## Installing

Download `gitdeck-amd64-installer.exe` from the
[releases](https://github.com/yahyashareef48/git-repo-tracker/releases), or grab
`GitDeck.exe` and run it from anywhere — it is portable and writes only to
`%APPDATA%\GitDeck`.

**Requirements:** Windows 10 1803+ or Windows 11 (for WebView2, which ships with
both), and `git` on your PATH. `gh` is optional — without it GitDeck simply says
it cannot check GitHub's status.

---

## Building

One-time setup:

```powershell
winget install GoLang.Go
winget install NSIS.NSIS
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

No C compiler, no Visual Studio, no Rust: Go ships its own linker and Wails v2's
WebView2 binding is pure Go.

Then:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build.ps1
```

That vets, tests, typechecks, and produces both artefacts in `build\bin`. The
version comes from `info.productVersion` in `wails.json` and is stamped into the
binary, the installer and the update check from that single place.

For development, `wails dev` gives hot reload and also serves the app at
<http://localhost:34115> in a browser, with the Go bindings callable from the
console.

**Known gap:** the exe's Windows file-properties version fields read as empty.
The strings are embedded — you can find them in the binary — but Wails' resource
block is not one `FileVersionInfo` reads back. The installer carries the right
metadata, and the app reports its own version in Settings, which is the number
the update check uses.

---

## How it is put together

```
main.go              window options, Mica, embedded assets
app.go               the entire bound API — nothing else is callable from JS
internal/
  gitx/              every git operation, as one spawn helper plus readers
  github/            the connectivity probe
  store/             tracked repos and settings, JSON in %APPDATA%
  tray/ trayicon/    notification area icon, badge drawn into the .ico
  autostart/         the per-user Run registry entry
  update/            GitHub releases check via gh
frontend/src/
  App.tsx            full window; MiniPanel.tsx is the tray panel
  components/        rows, diff, branch picker, dialogs
  store/             zustand: repos.ts for the list, detail.ts for one repo
```

Two rules the code sticks to:

- **The frontend never touches the filesystem and never spawns anything.** Every
  git call is one bound method returning a typed result.
- **git's own CLI is the implementation.** No libgit2, no go-git. Behaviour
  matches what you would get in a terminal, and stderr goes straight to the log
  drawer instead of being paraphrased.
