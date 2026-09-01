import { create } from 'zustand'
import {
  AddRepo,
  AddRepos,
  ChooseFolder,
  GetEnv,
  GetRepo,
  ListRepos,
  RemoveRepo,
  ScanFolder,
  SetPinned,
} from '../../wailsjs/go/main/App'
import type { main } from '../../wailsjs/go/models'

export type RepoView = main.RepoView
export type ScanResult = main.ScanResult
export type Env = main.Env

export type Toast = {
  id: number
  kind: 'info' | 'error' | 'success'
  text: string
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

  init: () => Promise<void>
  refresh: () => Promise<void>
  refreshOne: (path: string) => Promise<void>
  setQuery: (q: string) => void
  toggleExpanded: (path: string) => void
  addRepo: () => Promise<void>
  removeRepo: (path: string) => Promise<void>
  togglePin: (path: string, pinned: boolean) => Promise<void>

  startScan: () => Promise<void>
  toggleScanPick: (path: string) => void
  setAllScanPicks: (on: boolean) => void
  confirmScan: () => Promise<void>
  cancelScan: () => void

  toast: (kind: Toast['kind'], text: string) => void
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

  async init() {
    try {
      set({ env: await GetEnv() })
    } catch (e) {
      get().toast('error', message(e))
    }
    await get().refresh()
  },

  async refresh() {
    set({ loading: true })
    try {
      set({ repos: await ListRepos() })
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

  toast(kind, text) {
    const id = ++toastSeq
    set((s) => ({ toasts: [...s.toasts, { id, kind, text }] }))
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 6000 : 3000)
  },

  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },
}))
