# GitDeck

**One window for every local repository and worktree you have open.**

---

## Why this exists

Agentic engineering breaks the assumption every git UI is built on: that you are
in one repository, on one branch, doing one thing.

In practice an agent is editing three repos while you review a fourth. Work gets
parked in linked worktrees so several branches can be live at once. You come back
after twenty minutes of deep work and the honest answer to *what changed?* is: no
idea. Which repos are dirty. Which branches never got pushed. Which worktree that
half-finished change is sitting in. Whether anything is behind `main` now.

Finding out means a terminal, `cd`, `git status`, `cd`, `git status`, again and
again — or a VS Code window per repository. Both cost exactly the focus you were
trying to protect.

GitDeck answers that question at a glance and lets you act on it without leaving:
every tracked repo and worktree on one screen, with the one button each of them
actually needs.

## What it does

It is a git client scoped to *many repositories at once* rather than one:

- **Everything at once.** Repos and their linked worktrees in a single tree, each
  with its branch, ahead/behind, uncommitted count and stash count.
- **The obvious action.** One button per row that reads the state and offers
  Publish, Pull, Push or Sync — whichever that repo needs right now.
- **Grouped and filtered.** Group by client or project, tick an ad-hoc set, and
  act on just those.
- **Real git work.** Stage, commit, amend, stash, discard, switch and create
  branches, add and remove worktrees, read any commit's diff — without opening an
  editor.
- **A tray panel.** Left-click the tray for a compact list scoped to the repos or
  group you chose. Deep in something else, one glance tells you if anything needs
  you.
- **Honest about failure.** It checks whether GitHub is actually reachable and
  disables remote actions with a reason when it is not, instead of letting each
  push fail on its own. Every git command it runs, and that command's real
  output, is one click away.

## How it works

[Wails v2](https://wails.io): a Go core with a React frontend rendered by the
WebView2 runtime already present on Windows, so no browser is bundled — the app
is a ~12 MB exe rather than ~180 MB.

Every git operation shells out to **git's own CLI**. No libgit2, no reimplemented
plumbing: behaviour is exactly what you would get in a terminal, and stderr goes
straight to the log drawer instead of being paraphrased. GitHub connectivity is
checked through `gh`, reusing the credentials you already set up.

GitDeck never handles your credentials. Every git and `gh` call runs with
`GIT_TERMINAL_PROMPT=0` and no editor, so it fails with a clear message rather
than hanging on a prompt you cannot see. Signing in is `gh auth login`, in your
own terminal.

### Footprint

Measured on a release build, ten repositories tracked:

| | |
|---|---|
| Portable exe | **12.2 MB** |
| Installer | **6.6 MB** |
| Cold start to window | **~2.2 s** |
| Memory, idle | **~420 MB** working set across 7 processes (~360 MB private) |

That memory figure deserves a caveat, because it is the one thing about this
stack that is routinely undersold: the 12 MB binary is real, but WebView2 is
Chromium, and it starts six processes like any browser tab would. The small
binary buys disk space and download size, not RAM. If that matters more than
everything else here, a native UI toolkit is the honest answer.

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

The installer is NSIS, not MSI: it is a signed-by-nobody `.exe`, so SmartScreen
will warn on first run. "More info" → "Run anyway", or use the portable exe.

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
