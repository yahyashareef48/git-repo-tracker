import { create } from 'zustand'
import {
  CommitChanges,
  GetCommitDiff,
  GetLog,
  ShowCommit,
  DiscardFiles,
  GetDetail,
  GetDiff,
  StageFiles,
  StashAction,
  StashPush,
  UndoLastCommit,
  UnstageFiles,
} from '../../wailsjs/go/main/App'
import type { gitx, main } from '../../wailsjs/go/models'
import { useRepos } from './repos'

export type Detail = main.RepoDetail
export type Change = gitx.Change
export type Diff = gitx.Diff

export type FileRef = { path: string; staged: boolean; untracked: boolean }
export type Commit = gitx.Commit
export type CommitDetail = gitx.CommitDetail

export type Tab = 'changes' | 'history'

const PAGE = 50

type State = {
  open: boolean
  repoPath: string
  detail: Detail | null
  loading: boolean
  busy: boolean

  file: FileRef | null
  diff: Diff | null
  diffLoading: boolean

  message: string
  amend: boolean

  tab: Tab
  commits: Commit[]
  commitsLoading: boolean
  commitsExhausted: boolean
  sha: string
  commitDetail: CommitDetail | null
  commitFile: string
  commitDiff: Diff | null
  commitDiffLoading: boolean

  setTab: (t: Tab) => Promise<void>
  loadMoreCommits: () => Promise<void>
  selectCommit: (sha: string) => Promise<void>
  selectCommitFile: (file: string) => Promise<void>

  openDetail: (path: string) => Promise<void>
  close: () => void
  reload: () => Promise<void>
  selectFile: (f: FileRef | null) => Promise<void>

  setMessage: (m: string) => void
  toggleAmend: () => void

  stage: (files: string[]) => Promise<void>
  unstage: (files: string[]) => Promise<void>
  discard: (files: string[], untracked: boolean) => Promise<void>
  commit: () => Promise<void>
  undoCommit: () => Promise<void>
  stash: (message: string, includeUntracked: boolean) => Promise<void>
  stashAction: (action: 'apply' | 'pop' | 'drop', ref: string) => Promise<void>
}

function sameFile(a: FileRef | null, b: FileRef | null) {
  return !!a && !!b && a.path === b.path && a.staged === b.staged
}

export const useDetail = create<State>((set, get) => ({
  open: false,
  repoPath: '',
  detail: null,
  loading: false,
  busy: false,

  file: null,
  diff: null,
  diffLoading: false,

  message: '',
  amend: false,

  tab: 'changes',
  commits: [],
  commitsLoading: false,
  commitsExhausted: false,
  sha: '',
  commitDetail: null,
  commitFile: '',
  commitDiff: null,
  commitDiffLoading: false,

  async setTab(t) {
    set({ tab: t })
    // History is loaded lazily: most visits to this panel are about staging.
    if (t === 'history' && get().commits.length === 0) await get().loadMoreCommits()
  },

  async loadMoreCommits() {
    const { repoPath, commits, commitsLoading, commitsExhausted } = get()
    if (!repoPath || commitsLoading || commitsExhausted) return

    set({ commitsLoading: true })
    try {
      const page = (await GetLog(repoPath, commits.length, PAGE)) ?? []
      set((s) => ({
        commits: [...s.commits, ...page],
        commitsExhausted: page.length < PAGE,
      }))
      if (!get().sha && page.length > 0) await get().selectCommit(page[0].sha)
    } catch (e) {
      useRepos.getState().toast('error', String(e))
    } finally {
      set({ commitsLoading: false })
    }
  },

  async selectCommit(sha) {
    set({ sha, commitDetail: null, commitFile: '', commitDiff: null })
    try {
      const detail = await ShowCommit(get().repoPath, sha)
      if (get().sha !== sha) return
      set({ commitDetail: detail })
      const first = detail.files?.[0]
      if (first) await get().selectCommitFile(first.path)
    } catch (e) {
      useRepos.getState().toast('error', String(e))
    }
  },

  async selectCommitFile(file) {
    const sha = get().sha
    set({ commitFile: file, commitDiffLoading: true })
    try {
      const diff = await GetCommitDiff(get().repoPath, sha, file)
      if (get().sha === sha && get().commitFile === file) set({ commitDiff: diff })
    } catch (e) {
      useRepos.getState().toast('error', String(e))
    } finally {
      set({ commitDiffLoading: false })
    }
  },

  async openDetail(path) {
    set({
      open: true,
      repoPath: path,
      detail: null,
      file: null,
      diff: null,
      message: '',
      amend: false,
      loading: true,
      tab: 'changes',
      commits: [],
      commitsExhausted: false,
      sha: '',
      commitDetail: null,
      commitFile: '',
      commitDiff: null,
    })
    await get().reload()

    // Land on something useful rather than an empty pane.
    const d = get().detail
    const first =
      d?.changes.unstaged?.[0] ?? d?.changes.staged?.[0] ?? d?.changes.untracked?.[0]
    if (first) {
      await get().selectFile({
        path: first.path,
        staged: !!first.staged,
        untracked: first.kind === 'untracked',
      })
    }
  },

  close() {
    set({
      open: false,
      detail: null,
      file: null,
      diff: null,
      message: '',
      amend: false,
      commits: [],
      commitDetail: null,
      commitDiff: null,
      sha: '',
    })
  },

  async reload() {
    const path = get().repoPath
    if (!path) return
    set({ loading: true })
    try {
      const detail = await GetDetail(path)
      set({ detail })

      // The selected file may have just been staged, committed or discarded.
      // Staging moves it between lists rather than removing it, so follow it
      // across instead of dumping the user back to an empty pane.
      const f = get().file
      if (f) {
        const all = [
          ...(detail.changes.staged ?? []),
          ...(detail.changes.unstaged ?? []),
          ...(detail.changes.untracked ?? []),
          ...(detail.changes.conflicted ?? []),
        ]
        const exact = all.find((c) => c.path === f.path && !!c.staged === f.staged)
        const moved = all.find((c) => c.path === f.path)

        if (!exact && moved) {
          set({ file: { path: moved.path, staged: !!moved.staged, untracked: moved.kind === 'untracked' } })
        } else if (!exact) {
          set({ file: null, diff: null })
        }
      }
    } catch (e) {
      useRepos.getState().toast('error', String(e))
    } finally {
      set({ loading: false })
    }
  },

  async selectFile(f) {
    if (!f) {
      set({ file: null, diff: null })
      return
    }
    set({ file: f, diffLoading: true })
    try {
      const diff = await GetDiff(get().repoPath, f.path, f.staged, f.untracked)
      // A slow diff must not overwrite a newer selection.
      if (sameFile(get().file, f)) set({ diff })
    } catch (e) {
      useRepos.getState().toast('error', String(e))
    } finally {
      set({ diffLoading: false })
    }
  },

  setMessage(m) {
    set({ message: m })
  },

  toggleAmend() {
    const next = !get().amend
    const last = get().detail?.lastMessage?.trim() ?? ''
    set((s) => ({
      amend: next,
      // Amending starts from the message you are amending; turning it back off
      // clears it again rather than leaving someone else's words behind.
      message: next ? (s.message.trim() === '' ? last : s.message) : s.message === last ? '' : s.message,
    }))
  },

  stage: (files) => run('Stage', () => StageFiles(get().repoPath, files)),
  unstage: (files) => run('Unstage', () => UnstageFiles(get().repoPath, files)),
  discard: (files, untracked) =>
    run('Discard', () => DiscardFiles(get().repoPath, files, untracked)),

  async commit() {
    const { repoPath, message, amend } = get()
    await run('Commit', () => CommitChanges(repoPath, message, amend))
    // Only clear the box if the commit actually landed.
    const after = get().detail
    if (after && (after.changes.staged ?? []).length === 0) {
      set({ message: '', amend: false })
    }
  },

  undoCommit: () => run('Undo commit', () => UndoLastCommit(get().repoPath)),

  stash: (message, includeUntracked) =>
    run('Stash', () => StashPush(get().repoPath, message, includeUntracked)),

  stashAction: (action, ref) =>
    run(`Stash ${action}`, () => StashAction(get().repoPath, action, ref)),
}))

/**
 * Runs one git action, records it in the shared log, reports failure, then
 * refreshes both the panel and the repo's row so the two never disagree.
 */
async function run(label: string, fn: () => Promise<gitx.OpResult>) {
  const detail = useDetail.getState()
  const repos = useRepos.getState()
  useDetail.setState({ busy: true })

  try {
    const res = await fn()
    const at = new Date().toLocaleTimeString()
    const repoName = detail.detail?.name ?? detail.repoPath

    useRepos.setState((s) => ({ log: [...s.log, { ...res, at, repoName }].slice(-300) }))

    if (!res.ok) {
      repos.toast('error', `${label} failed: ${res.error}`, { detail: res.hint })
    } else if (res.stdout) {
      repos.toast('success', `${label} — ${res.stdout.split('\n')[0]}`)
    }
  } catch (e) {
    repos.toast('error', String(e))
  } finally {
    useDetail.setState({ busy: false })
    await useDetail.getState().reload()
    const f = useDetail.getState().file
    if (f) await useDetail.getState().selectFile(f)
    await repos.refreshOne(useDetail.getState().repoPath)
  }
}
