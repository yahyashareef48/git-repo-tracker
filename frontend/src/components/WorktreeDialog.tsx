import { useEffect, useState } from 'react'
import { FolderOpen, GitBranch, Loader2, TreeDeciduous, X } from 'lucide-react'
import { AddWorktree, ChooseFolder, ListBranches } from '../../wailsjs/go/main/App'
import type { gitx } from '../../wailsjs/go/models'
import { useRepos } from '../store/repos'

/**
 * Creates a linked worktree: a second checkout of the same repo in its own
 * folder, so a branch can be worked on without disturbing the first one.
 */
export function WorktreeDialog() {
  const path = useRepos((s) => s.worktreeTarget)
  const close = useRepos((s) => s.closeWorktreeDialog)
  const toast = useRepos((s) => s.toast)
  const refreshOne = useRepos((s) => s.refreshOne)

  const [folder, setFolder] = useState('')
  const [branch, setBranch] = useState('')
  const [createBranch, setCreateBranch] = useState(true)
  const [branches, setBranches] = useState<gitx.Branch[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!path) return
    setFolder('')
    setBranch('')
    setCreateBranch(true)
    ListBranches(path)
      .then((b) => setBranches((b ?? []).filter((x) => !x.remote)))
      .catch(() => setBranches([]))
  }, [path])

  if (!path) return null

  const repoName = path.split(/[\\/]/).pop() ?? path
  const existing = branches.some((b) => b.name === branch.trim())

  const pickFolder = async () => {
    try {
      const dir = await ChooseFolder('Where should the worktree live?')
      if (!dir) return
      // git refuses to create a worktree in an existing non-empty folder, so
      // append the branch name as a subfolder the user can still edit.
      const leaf = (branch.trim() || 'worktree').replace(/[\\/:*?"<>|]/g, '-')
      setFolder(dir.replace(/[\\/]+$/, '') + '\\' + leaf)
    } catch (e) {
      toast('error', String(e))
    }
  }

  const submit = async () => {
    if (!folder.trim()) {
      toast('info', 'Choose a folder for the worktree first.')
      return
    }
    setBusy(true)
    try {
      const res = await AddWorktree(path, folder.trim(), branch.trim(), createBranch && !existing)
      const at = new Date().toLocaleTimeString()
      useRepos.setState((s) => ({
        log: [...s.log, { ...res, at, repoName }].slice(-300),
      }))

      if (!res.ok) {
        toast('error', `Add worktree failed: ${res.error}`, { detail: res.hint })
        return
      }
      toast('success', `Worktree created at ${folder.trim()}`)
      close()
      await refreshOne(path)
    } catch (e) {
      toast('error', String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-8 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="animate-fade-in w-full max-w-[460px] overflow-hidden rounded-xl border border-line-strong bg-surface-raised shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          <TreeDeciduous size={15} className="text-accent" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold">New worktree</div>
            <div className="truncate text-[11px] text-ink-faint">{repoName}</div>
          </div>
          <button
            onClick={close}
            aria-label="Close"
            className="grid h-7 w-7 place-items-center rounded text-ink-faint hover:bg-surface-hover hover:text-ink"
          >
            <X size={14} />
          </button>
        </div>

        <div className="space-y-3 px-4 py-3">
          <Field label="Branch">
            <div className="flex items-center gap-2">
              <GitBranch size={13} className="shrink-0 text-ink-faint" />
              <input
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                list="gitdeck-branches"
                placeholder="feat/my-branch"
                className="selectable min-w-0 flex-1 bg-transparent font-mono text-[12.5px] text-ink outline-none placeholder:text-ink-faint"
              />
              <datalist id="gitdeck-branches">
                {branches.map((b) => (
                  <option key={b.name} value={b.name} />
                ))}
              </datalist>
            </div>
            <p className="mt-1 text-[11px] text-ink-faint">
              {branch.trim() === ''
                ? 'Leave empty for a detached checkout.'
                : existing
                  ? 'This branch already exists — the worktree will check it out.'
                  : 'This branch will be created.'}
            </p>
          </Field>

          <Field label="Folder">
            <div className="flex items-center gap-2">
              <input
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                placeholder="C:\path\to\worktree"
                className="selectable min-w-0 flex-1 bg-transparent font-mono text-[12px] text-ink outline-none placeholder:text-ink-faint"
              />
              <button
                onClick={pickFolder}
                title="Choose a parent folder"
                className="grid h-6 w-6 shrink-0 place-items-center rounded text-ink-faint hover:bg-surface-hover hover:text-ink"
              >
                <FolderOpen size={13} />
              </button>
            </div>
            <p className="mt-1 text-[11px] text-ink-faint">
              The folder must not exist yet, or must be empty.
            </p>
          </Field>
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button
            onClick={close}
            className="rounded-md px-3 py-1.5 text-[12.5px] text-ink-soft hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !folder.trim()}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-medium text-[#0b0e14] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy && <Loader2 size={12} className="animate-spin-slow" />}
            Create worktree
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] uppercase tracking-wide text-ink-faint">{label}</div>
      <div className="rounded-md border border-line bg-[rgba(255,255,255,0.04)] px-2.5 py-1.5">
        {children}
      </div>
    </div>
  )
}
