import { create } from 'zustand'
import {
  AddRepo,
  AddRepos,
  CheckGitHub,
  CheckUpdate,
  ChooseFolder,
  CopyToClipboard,
  EnterMini,
  ExitMini,
  GetAutostart,
  GetEnv,
  GetRepo,
  GetSettings,
  IsMini,
  ListRepos,
  ListGroups,
  OpenURL,
  RemoveRepo,
  Reorder,
  RunOp,
  ScanFolder,
  SaveSettings,
  SetAutostart,
  SetGroup,
  SetPinned,
} from '../../wailsjs/go/main/App'
import type { github, gitx, main, store, update } from '../../wailsjs/go/models'

export type RepoView = main.RepoView
export type ScanResult = main.ScanResult
export type Env = main.Env
export type Health = github.Health
export type Settings = store.Settings
export type UpdateInfo = update.Info

/** Which repos the compact tray panel shows. */
export function watchedRepos(repos: RepoView[], settings: Settings | null) {
  if (!settings || settings.watchMode === 'all') return repos
  if (settings.watchMode === 'group') {
    return repos.filter((r) => r.group === settings.watchGroup)
  }
  const picked = new Set(settings.watchPaths ?? [])
  return repos.filter((r) => picked.has(r.path))
}

/** One repo's outcome inside a bulk run, for the progress strip. */
export type BulkResult = { path: string; name: string; ok: boolean; error: string }
export type Bulk = { op: Op; total: number; done: number; results: BulkResult[] } | null

/** Remote git is worth attempting unless GitHub is plainly unreachable. A
 *  missing gh CLI is not a blocker: git may still have working credentials. */
export function remoteUsable(h: Health | null) {
  if (!h) return true
  return h.state === 'connected' || h.state === 'degraded' || h.state === 'nocli'
}
export type OpResult = gitx.OpResult

/** Every git operation the app has run this session, newest last. */
export type LogEntry = OpResult & { at: string; repoName: string }

export type ToastAction = { label: string; run: () => void }

export type Toast = {
  id: number
  kind: 'info' | 'error' | 'success'
  text: string
  detail?: string
  actions?: ToastAction[]
}

/** Op names understood by the Go RunOp binding. */
export type Op =
  | 'fetch'
  | 'pull'
  | 'pull-merge'
  | 'pull-rebase'
  | 'push'
  | 'publish'
  | 'sync'
  | 'pull-from-main'

const opLabels: Record<Op, string> = {
  fetch: 'Fetch',
  pull: 'Pull',
  'pull-merge': 'Pull (merge)',
  'pull-rebase': 'Pull (rebase)',
  push: 'Push',
  publish: 'Publish branch',
  sync: 'Sync',
  'pull-from-main': 'Pull from main',
}

export const opLabel = (op: Op) => opLabels[op] ?? op

/** Sentinel group filter meaning "only repos that have no group". */
export const UNGROUPED = '__ungrouped__'

/** Sentinel group filter meaning "only the repos I ticked". */
export const SELECTED = '__selected__'

/** The repos currently on screen, after the group filter and search box. */
export function filterRepos(
  repos: RepoView[],
  groupFilter: string,
  query: string,
  selected: Set<string> = new Set(),
) {
  const q = query.trim().toLowerCase()
  return repos.filter((r) => {
    if (groupFilter === SELECTED && !selected.has(r.path)) return false
    if (groupFilter === UNGROUPED && r.group) return false
    if (groupFilter && groupFilter !== UNGROUPED && groupFilter !== SELECTED && r.group !== groupFilter)
      return false
    if (!q) return true
    return (
      r.name.toLowerCase().includes(q) ||
      r.path.toLowerCase().includes(q) ||
      (r.status.branch ?? '').toLowerCase().includes(q)
    )
  })
}

type ScanState = {
  root: string
  results: ScanResult[]
  selected: Set<string>
  scanning: boolean
} | null

type State = {
  repos: RepoView[]
  env: Env | null
  loading: boolean
  query: string
  expanded: Set<string>
  busy: Set<string>
  toasts: Toast[]
  scan: ScanState
  log: LogEntry[]
  logOpen: boolean
  groups: string[]
  health: Health | null
  healthChecking: boolean
  settings: Settings | null
  autostart: boolean
  update: UpdateInfo | null
  updateChecking: boolean
  settingsOpen: boolean
  bulk: Bulk
  /** 'mini' is the compact tray panel; the app has only one real window. */
  mode: 'full' | 'mini'
  /** '' = every repo, UNGROUPED = only repos with no group, else that group. */
  groupFilter: string
  /** Repos whose "move to group" dialog is open; empty when closed. */
  groupTargets: string[]
  /** Repo whose branch picker is open. */
  branchTarget: string | null
  /** Repo whose "new worktree" dialog is open. */
  worktreeTarget: string | null
  /** Repos the user has ticked, for filtering and bulk actions. */
  selected: Set<string>

  init: () => Promise<void>
  checkHealth: () => Promise<void>
  copyAuthCommand: () => Promise<void>
  loadSettings: () => Promise<void>
  checkUpdate: (announce: boolean) => Promise<void>
  saveSettings: (patch: Partial<Settings>) => Promise<void>
  setAutostart: (on: boolean) => Promise<void>
  toggleSettings: () => void
  dismissBulk: () => void
  setMode: (m: 'full' | 'mini') => void
  enterMini: () => Promise<void>
  exitMini: () => Promise<void>
  refresh: () => Promise<void>
  refreshOne: (path: string) => Promise<void>
  setQuery: (q: string) => void
  toggleExpanded: (path: string) => void
  setAllExpanded: (on: boolean) => void
  openBranchPicker: (path: string) => void
  closeBranchPicker: () => void
  openWorktreeDialog: (path: string) => void
  closeWorktreeDialog: () => void
  addRepo: () => Promise<void>
  removeRepo: (path: string) => Promise<void>
  togglePin: (path: string, pinned: boolean) => Promise<void>

  setGroupFilter: (g: string) => void
  openGroupDialog: (paths: string[]) => void
  closeGroupDialog: () => void
  setGroup: (paths: string[], group: string) => Promise<void>

  /** Path being dragged, for the reorder affordance. */
  dragging: string | null
  setDragging: (path: string | null) => void
  reorder: (fromPath: string, toPath: string) => Promise<void>

  toggleSelected: (path: string) => void
  selectVisible: (paths: string[]) => void
  clearSelection: () => void

  runOp: (path: string, op: Op) => Promise<void>
  runOpAll: (op: Op) => Promise<void>
  toggleLog: () => void
  clearLog: () => void

  startScan: () => Promise<void>
  toggleScanPick: (path: string) => void
  setAllScanPicks: (on: boolean) => void
  confirmScan: () => Promise<void>
  cancelScan: () => void

  toast: (
    kind: Toast['kind'],
    text: string,
    extra?: { detail?: string; actions?: ToastAction[] },
  ) => void
  dismissToast: (id: number) => void
}

let toastSeq = 0

const EXPANDED_KEY = 'gitdeck.expanded'

/** Which repos had their worktrees open last time. Losing this on every launch
 *  makes the tree feel like it resets itself. */
function loadExpanded(): Set<string> {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY)
    return new Set<string>(raw ? JSON.parse(raw) : [])
  } catch {
    return new Set<string>()
  }
}

function saveExpanded(s: Set<string>) {
  try {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...s]))
  } catch {
    // A blocked localStorage is not worth failing a click over.
  }
}

// Wails rejects with a plain string for Go errors; normalise both shapes.
function message(e: unknown): string {
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  return String(e)
}

export const useRepos = create<State>((set, get) => ({
  repos: [],
  env: null,
  loading: false,
  query: '',
  expanded: loadExpanded(),
  busy: new Set<string>(),
  toasts: [],
  scan: null,
  log: [],
  logOpen: false,
  groups: [],
  health: null,
  healthChecking: false,
  settings: null,
  autostart: false,
  update: null,
  updateChecking: false,
  settingsOpen: false,
  bulk: null,
  mode: 'full',
  groupFilter: '',
  groupTargets: [],
  branchTarget: null,
  worktreeTarget: null,
  selected: new Set<string>(),
  dragging: null,

  async init() {
    try {
      set({ env: await GetEnv() })
    } catch (e) {
      get().toast('error', message(e))
    }
    await get().refresh()
    await get().checkHealth()
    await get().loadSettings()
    try {
      // The window may already be in panel mode when the frontend reloads.
      set({ mode: (await IsMini()) ? 'mini' : 'full' })
    } catch {
      // Mode is cosmetic; a failure here must not block startup.
    }
  },

  async loadSettings() {
    try {
      const [settings, autostart] = await Promise.all([GetSettings(), GetAutostart()])
      set({ settings, autostart })
    } catch (e) {
      get().toast('error', message(e))
    }
  },

  async checkUpdate(announce) {
    set({ updateChecking: true })
    try {
      const info = await CheckUpdate()
      set({ update: info })

      // Only speak up when asked, or when there is genuinely something new.
      // A silent launch check that toasts "you are up to date" is noise.
      if (info.error) {
        if (announce) get().toast('error', `Update check failed: ${info.error}`)
      } else if (info.available) {
        get().toast('info', `GitDeck ${info.latest} is available.`, {
          detail: `You are on ${info.current}.`,
          actions: info.url
            ? [{ label: 'Open release', run: () => OpenURL(info.url) }]
            : undefined,
        })
      } else if (announce) {
        get().toast('success', `GitDeck ${info.current} is the latest version.`)
      }
    } catch (e) {
      if (announce) get().toast('error', message(e))
    } finally {
      set({ updateChecking: false })
    }
  },

  async saveSettings(patch) {
    const current = get().settings
    if (!current) return
    const next = { ...current, ...patch } as Settings
    set({ settings: next })
    try {
      await SaveSettings(next)
    } catch (e) {
      set({ settings: current })
      get().toast('error', message(e))
    }
  },

  async setAutostart(on) {
    try {
      await SetAutostart(on)
      set({ autostart: on })
      get().toast(
        'success',
        on ? 'GitDeck will start with Windows.' : 'GitDeck will no longer start with Windows.',
      )
    } catch (e) {
      get().toast('error', message(e))
    }
  },

  toggleSettings() {
    set((s) => ({ settingsOpen: !s.settingsOpen }))
  },

  setMode(m) {
    set({ mode: m })
  },

  async enterMini() {
    try {
      await EnterMini()
    } catch (e) {
      get().toast('error', message(e))
    }
  },

  async exitMini() {
    try {
      await ExitMini()
    } catch (e) {
      get().toast('error', message(e))
    }
  },

  dismissBulk() {
    set({ bulk: null })
  },

  async checkHealth() {
    const before = get().health?.state
    set({ healthChecking: true })
    try {
      const health = await CheckGitHub()
      set({ health })

      // Log only on a state change: a 60-second poll that appends every time
      // would bury the git output it sits next to.
      if (health.state !== before && health.state !== 'connected') {
        set((s) => ({
          log: [
            ...s.log,
            {
              ok: false,
              op: 'github-check',
              repo: '',
              command: 'gh auth status && gh api rate_limit',
              stdout: '',
              stderr: health.detail || health.message,
              error: health.message,
              kind: health.state,
              hint: '',
              at: health.checkedAt,
              repoName: 'GitHub',
            },
          ].slice(-300),
        }))
      }
    } catch (e) {
      get().toast('error', message(e))
    } finally {
      set({ healthChecking: false })
    }
  },

  async copyAuthCommand() {
    try {
      await CopyToClipboard('gh auth login')
      get().toast('info', 'Copied `gh auth login` — run it in a terminal, then retry.')
    } catch (e) {
      get().toast('error', message(e))
    }
  },

  async refresh() {
    set({ loading: true })
    try {
      const [repos, groups] = await Promise.all([ListRepos(), ListGroups()])
      set({ repos, groups: groups ?? [] })
    } catch (e) {
      get().toast('error', message(e))
    } finally {
      set({ loading: false })
    }
  },

  async refreshOne(path) {
    set((s) => ({ busy: new Set(s.busy).add(path) }))
    try {
      const fresh = await GetRepo(path)
      set((s) => ({
        repos: s.repos.map((r) => (r.path === path ? fresh : r)),
      }))
    } catch (e) {
      get().toast('error', message(e))
    } finally {
      set((s) => {
        const busy = new Set(s.busy)
        busy.delete(path)
        return { busy }
      })
    }
  },

  setQuery(q) {
    set({ query: q })
  },

  toggleExpanded(path) {
    set((s) => {
      const next = new Set(s.expanded)
      next.has(path) ? next.delete(path) : next.add(path)
      saveExpanded(next)
      return { expanded: next }
    })
  },

  setAllExpanded(on) {
    set((s) => {
      const next = on ? new Set(s.repos.filter((r) => r.worktrees?.length).map((r) => r.path)) : new Set<string>()
      saveExpanded(next)
      return { expanded: next }
    })
  },

  openBranchPicker(path) {
    set({ branchTarget: path })
  },

  closeBranchPicker() {
    set({ branchTarget: null })
  },

  openWorktreeDialog(path) {
    set({ worktreeTarget: path })
  },

  closeWorktreeDialog() {
    set({ worktreeTarget: null })
  },

  async addRepo() {
    try {
      const dir = await ChooseFolder('Select a git repository')
      if (!dir) return
      await AddRepo(dir)
      get().toast('success', 'Added ' + dir.split(/[\\/]/).pop())
      await get().refresh()
    } catch (e) {
      get().toast('error', message(e))
    }
  },

  async removeRepo(path) {
    try {
      await RemoveRepo(path)
      set((s) => ({ repos: s.repos.filter((r) => r.path !== path) }))
      get().toast('info', 'Stopped tracking ' + path.split(/[\\/]/).pop())
    } catch (e) {
      get().toast('error', message(e))
    }
  },

  async togglePin(path, pinned) {
    try {
      await SetPinned(path, pinned)
      await get().refresh()
    } catch (e) {
      get().toast('error', message(e))
    }
  },

  setGroupFilter(g) {
    set({ groupFilter: g })
  },

  openGroupDialog(paths) {
    set({ groupTargets: paths })
  },

  closeGroupDialog() {
    set({ groupTargets: [] })
  },

  async setGroup(paths, group) {
    set({ groupTargets: [] })
    try {
      for (const p of paths) await SetGroup(p, group)
      await get().refresh()
      const what = paths.length === 1 ? '1 repository' : `${paths.length} repositories`
      get().toast('success', group ? `Moved ${what} to “${group}”` : `Ungrouped ${what}`)
    } catch (e) {
      get().toast('error', message(e))
    }
  },

  setDragging(path) {
    set({ dragging: path })
  },

  async reorder(fromPath, toPath) {
    if (fromPath === toPath) return

    const order = get().repos.map((r) => r.path)
    const from = order.indexOf(fromPath)
    const to = order.indexOf(toPath)
    if (from < 0 || to < 0) return

    order.splice(to, 0, ...order.splice(from, 1))

    // Reorder optimistically: waiting for a disk write and a full re-read
    // before the row moves makes dragging feel broken.
    const byPath = new Map(get().repos.map((r) => [r.path, r]))
    set({
      repos: order.map((p) => byPath.get(p)!).filter(Boolean),
      dragging: null,
    })

    try {
      await Reorder(order)
    } catch (e) {
      get().toast('error', message(e))
      await get().refresh()
    }
  },

  toggleSelected(path) {
    set((s) => {
      const next = new Set(s.selected)
      next.has(path) ? next.delete(path) : next.add(path)
      // Filtering to a now-empty selection would show an empty list with no
      // obvious way back, so fall out of the filter with the last tick.
      return next.size === 0 && s.groupFilter === SELECTED
        ? { selected: next, groupFilter: '' }
        : { selected: next }
    })
  },

  selectVisible(paths) {
    set((s) => {
      const next = new Set(s.selected)
      const allOn = paths.every((p) => next.has(p))
      for (const p of paths) (allOn ? next.delete(p) : next.add(p))
      return allOn && s.groupFilter === SELECTED
        ? { selected: next, groupFilter: '' }
        : { selected: next }
    })
  },

  clearSelection() {
    set((s) => (s.groupFilter === SELECTED ? { selected: new Set<string>(), groupFilter: '' } : { selected: new Set<string>() }))
  },

  async runOp(path, op) {
    const repo = get().repos.find((r) => r.path === path)
    const repoName = repo?.name ?? path.split(/[\\/]/).pop() ?? path

    set((s) => ({ busy: new Set(s.busy).add(path) }))
    try {
      const results = await RunOp(op, path)
      const at = new Date().toLocaleTimeString()
      set((s) => ({
        // Cap the log: this is a session scratchpad, not an audit trail.
        log: [...s.log, ...results.map((r) => ({ ...r, at, repoName }))].slice(-300),
      }))

      // A bulk run reports through its own progress strip; toasting each of
      // twenty repos would bury the screen.
      const inBulk = !!get().bulk

      const failed = results.find((r) => !r.ok)
      if (failed && !inBulk) {
        get().toast('error', `${opLabel(op)} failed — ${repoName}: ${failed.error}`, {
          detail: failed.hint,
          // A diverged branch has exactly two sensible resolutions; offer both
          // rather than making the user find them in a menu.
          actions:
            failed.kind === 'diverged'
              ? [
                  { label: 'Merge', run: () => get().runOp(path, 'pull-merge') },
                  { label: 'Rebase', run: () => get().runOp(path, 'pull-rebase') },
                ]
              : undefined,
        })
      } else if (!failed && !inBulk) {
        const summary = results
          .map((r) => r.stdout.split('\n').pop()?.trim())
          .filter(Boolean)
          .pop()
        get().toast('success', `${opLabel(op)} — ${repoName}`, { detail: summary })
      }
    } catch (e) {
      get().toast('error', message(e))
    } finally {
      set((s) => {
        const busy = new Set(s.busy)
        busy.delete(path)
        return { busy }
      })
      await get().refreshOne(path)
    }
  },

  async runOpAll(op) {
    // "all" means what the user can currently see: filtering to a group and
    // hitting Fetch all should not quietly fetch every other repo too.
    const { repos, groupFilter, query, selected } = get()
    const targets = filterRepos(repos, groupFilter, query, selected)
    if (targets.length === 0) return

    set({ bulk: { op, total: targets.length, done: 0, results: [] } })

    // Sequential on purpose: parallel network git across every repo is a good
    // way to trip rate limits and produce an unreadable log.
    for (const r of targets) {
      const before = get().log.length
      await get().runOp(r.path, op)

      // Whatever this repo appended to the shared log is its outcome.
      const added = get().log.slice(before)
      const failed = added.find((e) => !e.ok)
      set((s) =>
        s.bulk
          ? {
              bulk: {
                ...s.bulk,
                done: s.bulk.done + 1,
                results: [
                  ...s.bulk.results,
                  {
                    path: r.path,
                    name: r.name,
                    ok: !failed,
                    error: failed?.error ?? '',
                  },
                ],
              },
            }
          : {},
      )
    }
  },

  toggleLog() {
    set((s) => ({ logOpen: !s.logOpen }))
  },

  clearLog() {
    set({ log: [] })
  },

  async startScan() {
    try {
      const root = await ChooseFolder('Select a folder to scan for repositories')
      if (!root) return
      set({ scan: { root, results: [], selected: new Set(), scanning: true } })
      const results = await ScanFolder(root, 4)
      // Preselect only what is not already tracked — re-adding is a no-op but
      // showing it as "will be added" is a lie.
      const selected = new Set(results.filter((r) => !r.tracked).map((r) => r.path))
      set({ scan: { root, results, selected, scanning: false } })
    } catch (e) {
      set({ scan: null })
      get().toast('error', message(e))
    }
  },

  toggleScanPick(path) {
    set((s) => {
      if (!s.scan) return {}
      const selected = new Set(s.scan.selected)
      selected.has(path) ? selected.delete(path) : selected.add(path)
      return { scan: { ...s.scan, selected } }
    })
  },

  setAllScanPicks(on) {
    set((s) => {
      if (!s.scan) return {}
      const selected = on
        ? new Set(s.scan.results.filter((r) => !r.tracked).map((r) => r.path))
        : new Set<string>()
      return { scan: { ...s.scan, selected } }
    })
  },

  async confirmScan() {
    const scan = get().scan
    if (!scan) return
    const paths = [...scan.selected]
    set({ scan: null })
    if (paths.length === 0) return
    try {
      const failed = await AddRepos(paths)
      await get().refresh()
      if (failed && failed.length > 0) {
        get().toast('error', `${failed.length} folder(s) could not be added`)
      } else {
        get().toast('success', `Added ${paths.length} repositor${paths.length === 1 ? 'y' : 'ies'}`)
      }
    } catch (e) {
      get().toast('error', message(e))
    }
  },

  cancelScan() {
    set({ scan: null })
  },

  toast(kind, text, extra) {
    const id = ++toastSeq
    set((s) => ({ toasts: [...s.toasts, { id, kind, text, ...extra }] }))
    // Errors stay long enough to read the hint; ones offering a choice stay
    // until the user makes it.
    if (!extra?.actions) {
      setTimeout(() => get().dismissToast(id), kind === 'error' ? 8000 : 2500)
    }
  },

  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },
}))
