import { create } from 'zustand'
import {
  AddRepo,
  AddRepos,
  CheckGitHub,
  ChooseFolder,
  CopyToClipboard,
  GetEnv,
  GetRepo,
  ListRepos,
  ListGroups,
  RemoveRepo,
  RunOp,
  ScanFolder,
  SetGroup,
  SetPinned,
} from '../../wailsjs/go/main/App'
import type { github, gitx, main } from '../../wailsjs/go/models'

export type RepoView = main.RepoView
export type ScanResult = main.ScanResult
export type Env = main.Env
export type Health = github.Health

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
  /** '' = every repo, UNGROUPED = only repos with no group, else that group. */
  groupFilter: string
  /** Repos whose "move to group" dialog is open; empty when closed. */
  groupTargets: string[]
  /** Repos the user has ticked, for filtering and bulk actions. */
  selected: Set<string>

  init: () => Promise<void>
  checkHealth: () => Promise<void>
  copyAuthCommand: () => Promise<void>
  refresh: () => Promise<void>
  refreshOne: (path: string) => Promise<void>
  setQuery: (q: string) => void
  toggleExpanded: (path: string) => void
  addRepo: () => Promise<void>
  removeRepo: (path: string) => Promise<void>
  togglePin: (path: string, pinned: boolean) => Promise<void>

  setGroupFilter: (g: string) => void
  openGroupDialog: (paths: string[]) => void
  closeGroupDialog: () => void
  setGroup: (paths: string[], group: string) => Promise<void>

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
  expanded: new Set<string>(),
  busy: new Set<string>(),
  toasts: [],
  scan: null,
  log: [],
  logOpen: false,
  groups: [],
  health: null,
  healthChecking: false,
  groupFilter: '',
  groupTargets: [],
  selected: new Set<string>(),

  async init() {
    try {
      set({ env: await GetEnv() })
    } catch (e) {
      get().toast('error', message(e))
    }
    await get().refresh()
    await get().checkHealth()
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
      return { expanded: next }
    })
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

      const failed = results.find((r) => !r.ok)
      if (failed) {
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
      } else {
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
    const paths = filterRepos(repos, groupFilter, query, selected).map((r) => r.path)
    // Sequential on purpose: parallel network git across every repo is a good
    // way to trip rate limits and produce an unreadable log.
    for (const p of paths) {
      await get().runOp(p, op)
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
