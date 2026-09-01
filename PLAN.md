# GitDeck — Windows Git Repo Tracker

A beautiful native-feeling Windows desktop app that tracks your local repos and gives you
everything the VS Code Git panel does — sync, pull, push, pull-from-main, branches, stash,
worktrees — from one always-reachable place.

**Stack decision: Wails v2** (Go backend + WebView2 frontend, React/Tailwind UI).
Chosen over Tauri because Rust on Windows needs Visual Studio Build Tools for its linker
(~3.5 GB); Go ships its own linker. Chosen over Electron because the shipped app is ~15 MB
instead of ~180 MB.

---

## 0. Environment — verified, ready to build

`wails doctor` on 2026-09-01: **"Your system is ready for Wails development!"**

| Component | Status |
|---|---|
| Go | 1.27.0 ✅ installed this session |
| Wails CLI | v2.15.0 ✅ installed this session |
| WebView2 runtime | 151.0.4129.107 ✅ |
| Node / npm | 20.20.2 / 10.8.2 ✅ |
| git | 2.54.0.windows.1 ✅ |
| gh CLI | 2.96.0, logged in as `yahyashareef48` ✅ |
| C compiler | **not required** — confirmed, doctor lists no missing deps |
| NSIS | optional, only for the installer target (phase 8, ~2 MB) |
| UPX | optional, shrinks the final binary further |

**Actual toolchain footprint: ~593 MB** (Go 235 MB + GOPATH/module cache 358 MB) — versus the
~5 GB Rust + MSVC would have cost. Free disk: 225 GB.

### What end users need

**Nothing.** WebView2 ships with Windows 10 (1803+) and 11. `git` and `gh` are needed only for
the features that use them, and the app detects and reports their absence rather than failing
silently.

**Shipped size:** ~8 MB installer → ~15 MB installed → ~50 MB RAM idle, ~0.4 s cold start.

---

## 1. Stack

- **Shell:** Wails v2.15 — Go core, WebView2 renderer, Go structs bound directly to JS
- **UI:** React 18 + TypeScript + Vite
- **Styling:** Tailwind CSS v4 + shadcn/ui primitives (Radix) — dark-first, VS Code-ish density
- **Icons:** lucide-react
- **State:** Zustand in the frontend; all git work happens in Go, exposed as bound methods
- **Git:** `os/exec` spawning the real `git` binary — no go-git, no libgit2. Predictable
  behaviour, identical to what you'd type, and worktrees/`for-each-ref` just work
- **GitHub:** `gh` CLI spawned the same way — reuses the existing keyring auth, so the app never
  touches a token
- **Store:** plain `encoding/json` at `%APPDATA%/GitDeck/repos.json`
- **File watching:** `fsnotify` (already a Wails dependency)
- **Tray:** `energye/systray` — pure Go on Windows (Wails v2 has no built-in tray; v3 does)
- **Autostart:** `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` registry key via
  `golang.org/x/sys/windows/registry`
- **Window effects:** built into Wails — `options.Windows{ BackdropType: windows.Mica }`
- **Packaging:** `wails build -nsis` → NSIS installer, plus a plain portable `.exe`

**Why spawn `git` rather than use go-git:** git's own CLI is the reference implementation. Any
behaviour difference in a rebase or a worktree is a bug we'd have to reimplement. Spawning also
lets stderr stream straight into the UI log drawer.

---

## 2. Architecture

```
gitdeck/
  main.go                 wails.Run, window options, Mica, bind the API structs
  app.go                  App struct — lifecycle hooks, holds services
  internal/
    git/
      exec.go             shared spawn helper: timeout, GIT_TERMINAL_PROMPT=0, structured errors
      repo.go             status, branch, ahead/behind, remotes
      ops.go              fetch / pull / push / sync / pull-from-main / stash / checkout
      worktree.go         list / add / remove worktrees
      watcher.go          fsnotify on .git/HEAD, .git/refs, .git/index → runtime.EventsEmit
    github/
      probe.go            connectivity + gh auth health check
    store/
      store.go            tracked repo list (add / remove / reorder / group)
    tray/
      tray.go             systray icon, badge, quick menu
  api.go                  the bound surface — every method callable from JS

  frontend/
    src/
      App.tsx
      components/         RepoTree, RepoRow, BranchBadge, SyncButton, StatusDot,
                          ChangesPanel, DiffView, CommandPalette, ConnectivityBanner
      lib/ipc.ts          typed wrappers over the Wails-generated bindings
      store/              zustand slices
    wailsjs/              auto-generated Go→TS bindings (do not edit)
```

**Rule:** the frontend never spawns anything and never touches the filesystem. Every git call is
one bound-method call returning a Go struct that serialises to
`{ ok: true, data } | { ok: false, error, stderr }`.

**Bonus:** Wails generates TypeScript types from the Go structs, so the IPC contract can't drift.

---

## 3. Feature set (VS Code Git parity, plus extras)

### Repo tracking
- Add a repo via the native folder picker; validate with `git rev-parse --git-dir`
- **Scan a parent folder** — point it at `C:\Users\yahya\Projects` and auto-discover every repo
  underneath (depth-limited, skips `node_modules`)
- Remove a repo — untracks only, never deletes from disk; the confirm dialog says so explicitly
- Drag to reorder, optional groups, pinned favourites
- Each row shows: name, path, current branch, ahead/behind counts, dirty-file count, stash
  count, protected-branch marker
- **Worktrees render as children of their parent repo** — the same shape as your screenshot

### Git operations (per repo, and multi-select for bulk)

| Action | Command |
|---|---|
| Fetch | `git fetch --all --prune` |
| Pull | `git pull --ff-only`, falling back to a rebase/merge prompt |
| Push | `git push`, auto `-u origin <branch>` when there is no upstream |
| Sync | fetch → pull → push |
| Pull from main | `git fetch origin main && git merge origin/main` (merge — confirmed decision) |
| Publish branch | `git push -u origin HEAD` |
| Checkout / create branch | branch picker with search |
| Stage / unstage / discard | per file and all |
| Commit | message box, amend toggle, staged-file list |
| Stash / pop / drop | with a stash list |
| Undo last commit | `git reset --soft HEAD~1` |
| Open in | VS Code / Explorer / Terminal / GitHub web |

**Bulk mode:** select N repos → "Fetch all" / "Pull all" / "Sync all", with a per-repo result
strip so one failure never hides the others.

### Diff and history
- Changed-files list with A/M/D badges
- Unified diff rendered in-app (no Monaco: it would add megabytes to a 12 MB app for a read-only view)
- Commit log for the current branch, 50 at a time, click through to the full diff

### GitHub connectivity (explicit requirement)

Three-stage health probe on launch, every 60 s, and on demand:

1. `gh --version` — is the CLI even installed?
2. `gh auth status` — logged in? which account? which scopes?
3. `gh api /rate_limit` with a 2 s timeout — is github.com actually reachable right now?

UI response:

- **Connected** — green dot plus account name in the header
- **Degraded** — authed but the network probe failed, or rate limit is near zero
- **Offline / not authed** — persistent banner: *"GitHub unreachable — push, pull and sync will
  fail. [Retry] [Fix auth]"*. Every remote-touching button goes disabled with a tooltip saying
  why. Local-only actions (commit, stage, stash, branch) stay fully enabled.
- "Fix auth" copies `gh auth login` to the clipboard and opens a terminal — the app never
  handles credentials itself.
- The same pattern covers a missing `git` binary: a blocking first-run screen with a download link.

### Always-easy access (explicit requirement)
- **System tray icon** — badge shows how many repos have unpushed commits; left-click toggles the
  window, right-click gives a quick menu (Sync all / Fetch all / repo shortlist / Quit)
- **Start with Windows** — settings toggle writing the `Run` registry key, starts minimised to tray
- Installer creates a pinned taskbar shortcut

---

## 4. Auto-refresh strategy

- `fsnotify` watches each repo's `.git/HEAD`, `.git/refs/**`, `.git/index` — instant local status
  updates with zero polling cost, pushed to the frontend via `runtime.EventsEmit`
- Background `git fetch` every 5 min (configurable, pausable, skipped when offline) so
  ahead/behind stays honest
- Refresh on window focus
- Debounced 300 ms in Go, so a rebase does not cause a status stampede
- One goroutine per repo watcher, all cancelled through a shared `context.Context` on shutdown

---

## 5. Design language

- Dark-first, light theme available, follows the Windows accent colour
- Win 11 Mica backdrop (`BackdropType: windows.Mica`, `Frameless: true`) with a custom titlebar
  using `--wails-draggable` regions
- Inter for UI, Cascadia Code for paths, hashes and diffs
- Semantic status colours: ahead = blue, behind = amber, dirty = orange, conflict = red,
  clean = muted
- Motion: 150 ms ease-out on row expand; the spinner appears inline on the button that triggered
  the operation, never as a global blocking modal
- Every long-running op is cancellable and streams git's stderr into a collapsible log drawer

---

## 6. Build phases

| Phase | Deliverable |
|---|---|
| **0** | ✅ Toolchain installed, scaffold built, first binary produced |
| **1** | ✅ Repo store, add/remove/scan, live status, worktree nesting, groups, multi-select |
| **2** | ✅ Core ops: fetch, pull, push, sync, pull-from-main, with error surfacing |
| **3** | ✅ GitHub connectivity probe, banner, disabled-state wiring |
| **4** | ✅ Changes panel: stage / unstage / discard / commit / amend / stash, plus a built-in diff view |
| **5** | ✅ Worktree tree with add/remove, branch picker, history log |
| **6** | ✅ Tray with badge, autostart, close-to-tray, settings, bulk ops with progress, background fetch |
| **7** | ✅ Polish: focus rings, reduced-motion, empty states, drag-to-reorder, open-on-web, window title, dead code removed |
| **8** | ✅ `wails build -nsis` → installer + portable build; GitHub-releases update check |

Phases 0–3 already give a genuinely usable app. Each phase ends in a commit and a push.

---

## 7. Risks and decisions to confirm

1. **Tray is third-party** — Wails v2 has no built-in tray (v3 does). `energye/systray` is pure Go
   on Windows, but it is the one dependency most likely to need attention. Phase 6 proves it early
   enough to swap if needed. Global hotkeys are explicitly out of scope.
2. **Pull-from-main default** — merge or rebase? **Decided: merge.** Rebase may be added later as a per-repo option.
3. **Credential prompts** — a push needing credentials can block invisibly. Mitigation: run every
   remote op with `GIT_TERMINAL_PROMPT=0` and a 30 s timeout, then surface a clear
   "authentication required" error instead of hanging forever.
4. **Default main branch name** — detected per repo from `origin/HEAD`, falling back to `main`
   then `master`.
5. **No built-in auto-updater** — unlike Tauri, Wails v2 ships none. Phase 8 does a simple GitHub
   releases version check with a "download update" button rather than silent self-update.
6. **WebView2 on ancient Windows** — Windows 10 builds before 1803 are unsupported. The installer's
   bootstrapper covers everything newer.
