# GitDeck v0.2 — split the tray from the browser

A plan to cut idle memory by roughly 10×, by not keeping a browser engine
loaded just to hold a tray icon.

Nothing here is implemented. Numbers marked **measured** come from the v0.1.0
release build on this machine with ten repositories tracked; everything else is
an estimate and is labelled as one.

---

## 1. The problem, measured

| state | total | processes |
|---|---|---|
| idle, list only | **408 MB** | 7 |
| changes panel + diff open | **436 MB** | 7 |
| history, 50 commits + diffs | **434 MB** | 7 |
| after refreshing all 10 repos | **446 MB** | 7 |
| 60 s after all that, settled | **435 MB** | 7 |

Idle breakdown:

| process | MB | what it is |
|---|---|---|
| msedgewebview2 (browser) | 122 | Chromium's coordinator: input, storage, features |
| msedgewebview2 (renderer) | 82 | V8 + DOM + layout for our page |
| **GitDeck (Go)** | **76** | **our actual application** |
| msedgewebview2 (gpu) | 52 | compositor, even with the GPU disabled |
| msedgewebview2 (utility ×2) | 56 | network service, storage service |
| msedgewebview2 (crashpad) | 20 | crash handler |

**332 MB of that is Chromium, and almost none of it scales with our UI.** Going
from five repos to ten moved the renderer about 10 MB. A blank page would cost
nearly the same. Active use only adds ~30 MB on top of idle, which is the real
tell: this is resident engine, not work in progress.

The uncomfortable part is *when* we pay it. The tray panel — a list of text
rows — is what gets looked at ninety percent of the time, and it currently
costs the same 408 MB as the full diff viewer, because it is the same window.

---

## 2. The idea

Two binaries instead of one.

```
GitDeckTray.exe     always running    tray icon + the compact panel    Go only
GitDeck.exe         on demand         full window, diffs, history      Wails
```

- The **tray binary** owns the notification icon, polls repository status, draws
  the badge, and renders the compact panel itself with a native toolkit. No
  browser is involved at any point.
- The **full window** launches only when you ask for it, and exits when you
  close it. It keeps the webview, because diffs and history genuinely benefit
  from HTML's text layout.

Both read the same `%APPDATA%\GitDeck\repos.json`, and both import the same
`internal/` packages. No new git logic gets written.

### Why the split alone is not enough

Splitting without a native panel makes the common case *worse*: glancing would
mean launching the full app, so a glance would cost 400 MB and a two second
wait, where today it is instant. **The native panel is the point; the split is
what makes it possible.** They ship together or not at all.

---

## 3. Expected memory, all cases

Estimates except where marked measured. The tray binary's figure assumes the
Go runtime plus our polling heap, with no Wails and no embedded frontend.

| scenario | today (measured) | split only | **split + native panel** |
|---|---|---|---|
| sitting in the tray, not looking | 408 MB | ~30–40 MB | **~30–40 MB** |
| glancing at the compact panel | 408 MB | ~410 MB, +2 s wait | **~40–70 MB, instant** |
| full window open, browsing diffs | 436 MB | ~436 MB | ~436 MB |
| **weighted day** (90% tray, 10% window) | **~410 MB** | ~70 MB | **~70 MB** |

Panel toolkit choice changes the middle row:

| toolkit | panel adds | tray binary total | trade-off |
|---|---|---|---|
| **Gio** | +20–40 MB | ~50–70 MB | pure Go, draws everything, closest match to the current look |
| **walk** (Win32 controls) | +5–15 MB | ~35–45 MB | real native controls; coloured pills need owner-draw |
| **raw Win32 + GDI** | +3–8 MB | ~30–40 MB | lightest and no dependency, most hand-written code |

Recommendation: **Gio**. The panel has hover states, a scope dropdown, coloured
counters and a worktree tree. Owner-drawing all of that on a Win32 ListView is
more fiddly than drawing it outright, and Gio keeps it pure Go.

Other numbers that change:

- **Install size:** ~12 MB → ~12 MB + ~8 MB. Slightly larger.
- **Cold start of the full window:** unchanged at ~2.2 s, but now paid on every
  open rather than once per session.
- **Panel open time:** ~2 s today (it is the same window) → **instant**.
- **Startup with Windows:** launches the tray binary, so login gets cheaper too.

---

## 4. What moves where

Nothing in `internal/` changes. That is the whole point of the seam.

| package | tray binary | full window |
|---|---|---|
| `internal/gitx` | ✅ status polling, sync/fetch | ✅ everything |
| `internal/store` | ✅ read, and write watch scope | ✅ read/write |
| `internal/github` | ✅ connectivity for the badge | ✅ |
| `internal/tray` `internal/trayicon` | ✅ moves here | ❌ removed |
| `internal/autostart` | ✅ points at the tray binary | ❌ |
| `internal/update` | ✅ checks quietly | ✅ shows it |
| `app.go` bound API | ❌ | ✅ unchanged |
| `frontend/` React | ❌ | ✅ minus `MiniPanel.tsx` |

New code is one `cmd/traydeck/` package: a poll loop, the panel window, and a
launcher for the full app.

---

## 5. Phases

| phase | work | outcome |
|---|---|---|
| **0** | Try `EmptyWorkingSet` on hide-to-tray first | Might drop reported idle memory hard for ~20 lines. Do this before committing to anything below. |
| **1** | `cmd/traydeck`: tray, poll loop, badge, launch full app. No panel yet — the tray menu opens the window. | Idle drops to ~30–40 MB. Already a 10× win, shippable on its own. |
| **2** | Native panel in Gio: rows, worktree tree, counters, scope picker, per-row sync. | The glance becomes instant and cheap. This is the real deliverable. |
| **3** | Remove tray and `MiniPanel.tsx` from the Wails app; window exits on close. | One owner for each job, no duplicate tray icons. |
| **4** | Installer ships both, autostart points at the tray, update check moves. | Ships. |

Effort: phase 1 is about one session of the size the v0.1 phases were. Phase 2
is the big one, one and a half to two. Phases 3 and 4 are half a session
between them. Call it **three to four sessions** total.

---

## 6. What this costs

- **Two UI codebases.** Row rendering exists twice: React for the full window,
  Go for the panel. They will drift unless kept deliberately thin.
- **The panel's look is hand-built.** No CSS. The current design came cheaply
  from Tailwind; in Gio every pill, hover and elbow is drawn in code.
- **Opening the full window costs 2 s every time**, instead of a hidden window
  reappearing instantly. Mitigated by the panel being good enough that you
  rarely need the full window.
- **Two processes to reason about**, including making sure exactly one tray icon
  exists and one instance of each binary runs. Named mutexes.
- **Settings live in one file two processes read.** Writes are already atomic
  (temp file plus rename); the tray just needs to re-read on a timer.

---

## 7. The honest alternative

Rewrite the whole UI in Gio and drop the webview entirely. One binary, ~60–100 MB
in every state, no split needed, no duplicated rendering.

The reason not to: the diff viewer and history are the parts that genuinely use
what a browser is good at — text layout, selection, scrolling long documents.
Rebuilding those well in an immediate-mode toolkit is most of the work of the
whole app, and the payoff is only in the case that is already rare.

The split gets the same idle number for a fraction of that work. If the panel
turns out to cover ninety-nine percent of use, dropping the webview later
becomes a much smaller decision than it is today.
