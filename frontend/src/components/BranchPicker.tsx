import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Check,
  Cloud,
  GitBranch,
  Loader2,
  Lock,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import {
  CreateBranch,
  DeleteBranch,
  ListBranches,
  SwitchBranch,
} from '../../wailsjs/go/main/App'
import type { gitx } from '../../wailsjs/go/models'
import { useDetail } from '../store/detail'
import { useRepos } from '../store/repos'

type Branch = gitx.Branch

export function BranchPicker() {
  const path = useRepos((s) => s.branchTarget)
  const close = useRepos((s) => s.closeBranchPicker)
  const toast = useRepos((s) => s.toast)
  const refreshOne = useRepos((s) => s.refreshOne)

  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState('')
  const [query, setQuery] = useState('')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!path) return
    setQuery('')
    setLoading(true)
    ListBranches(path)
      .then((b) => setBranches(b ?? []))
      .catch((e) => toast('error', String(e)))
      .finally(() => setLoading(false))
    setTimeout(() => input.current?.focus(), 0)
  }, [path, toast])

  const { local, remote, exactMatch } = useMemo(() => {
    const q = query.trim().toLowerCase()
    const match = (b: Branch) => !q || b.name.toLowerCase().includes(q)
    return {
      local: branches.filter((b) => !b.remote && match(b)),
      remote: branches.filter((b) => b.remote && match(b)),
      exactMatch: branches.some((b) => b.name.toLowerCase() === q),
    }
  }, [branches, query])

  if (!path) return null

  /** Runs one branch action, then refreshes everything that shows a branch. */
  const act = async (label: string, key: string, fn: () => Promise<gitx.OpResult>) => {
    setBusy(key)
    try {
      const res = await fn()
      const at = new Date().toLocaleTimeString()
      const repoName = path.split(/[\\/]/).pop() ?? path
      useRepos.setState((s) => ({ log: [...s.log, { ...res, at, repoName }].slice(-300) }))

      if (!res.ok) {
        toast('error', `${label} failed: ${res.error}`, { detail: res.hint })
        return
      }
      toast('success', `${label} — ${repoName}`)
      close()
      await refreshOne(path)
      // The changes panel shows the branch too, so keep it honest.
      if (useDetail.getState().open && useDetail.getState().repoPath === path) {
        await useDetail.getState().reload()
      }
    } catch (e) {
      toast('error', String(e))
    } finally {
      setBusy('')
    }
  }

  const newBranchName = query.trim()
  const canCreate = newBranchName !== '' && !exactMatch

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start justify-center bg-black/50 p-8 pt-20 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="animate-fade-in flex max-h-[70vh] w-full max-w-[520px] flex-col overflow-hidden rounded-xl border border-line-strong bg-surface-raised shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-3 py-2.5">
          <GitBranch size={15} className="shrink-0 text-accent" />
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close()
              if (e.key === 'Enter') {
                const first = local[0] ?? remote[0]
                if (canCreate && !first) {
                  act('Create branch', 'new', () => CreateBranch(path, newBranchName, ''))
                } else if (first) {
                  act('Switch branch', first.name, () =>
                    SwitchBranch(path, first.name, first.remote),
                  )
                }
              }
            }}
            placeholder="Search branches, or type a new name…"
            className="selectable min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-faint"
          />
          <button
            onClick={close}
            aria-label="Close"
            className="grid h-6 w-6 shrink-0 place-items-center rounded text-ink-faint hover:bg-surface-hover hover:text-ink"
          >
            <X size={13} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-[12.5px] text-ink-faint">
              <Loader2 size={14} className="animate-spin-slow" />
              Reading branches…
            </div>
          ) : (
            <>
              {canCreate && (
                <button
                  onClick={() =>
                    act('Create branch', 'new', () => CreateBranch(path, newBranchName, ''))
                  }
                  className="flex w-full items-center gap-2 border-b border-line px-3 py-2 text-left transition-colors hover:bg-surface-hover"
                >
                  {busy === 'new' ? (
                    <Loader2 size={13} className="animate-spin-slow text-accent" />
                  ) : (
                    <Plus size={13} className="text-accent" />
                  )}
                  <span className="text-[12.5px] text-ink-soft">
                    Create branch{' '}
                    <span className="font-mono text-accent">{newBranchName}</span> from here
                  </span>
                </button>
              )}

              {local.length > 0 && <GroupHeading>Local</GroupHeading>}
              {local.map((b) => (
                <BranchRow
                  key={'l' + b.name}
                  branch={b}
                  busy={busy === b.name}
                  onSwitch={() =>
                    act('Switch branch', b.name, () => SwitchBranch(path, b.name, false))
                  }
                  onDelete={() => {
                    const msg =
                      `Delete branch "${b.name}"?\n\n` +
                      'Unmerged branches are refused unless you confirm again.'
                    if (!window.confirm(msg)) return
                    act('Delete branch', b.name, async () => {
                      const res = await DeleteBranch(path, b.name, false)
                      if (res.ok || !/not fully merged/i.test(res.stderr)) return res
                      if (!window.confirm(`"${b.name}" is not fully merged. Delete it anyway?`)) {
                        return res
                      }
                      return DeleteBranch(path, b.name, true)
                    })
                  }}
                />
              ))}

              {remote.length > 0 && <GroupHeading>Remote</GroupHeading>}
              {remote.map((b) => (
                <BranchRow
                  key={'r' + b.name}
                  branch={b}
                  busy={busy === b.name}
                  onSwitch={() =>
                    act('Check out', b.name, () => SwitchBranch(path, b.name, true))
                  }
                />
              ))}

              {local.length + remote.length === 0 && !canCreate && (
                <div className="py-10 text-center text-[12.5px] text-ink-faint">
                  No branch matches.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-10 border-y border-line bg-surface-raised px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-ink-faint">
      {children}
    </div>
  )
}

function BranchRow({
  branch,
  busy,
  onSwitch,
  onDelete,
}: {
  branch: Branch
  busy: boolean
  onSwitch: () => void
  onDelete?: () => void
}) {
  // git will not check out a branch that another worktree already holds, so
  // saying so here beats letting the checkout fail.
  const heldElsewhere = !branch.current && !!branch.checkedOut

  return (
    <div className="group flex items-center gap-2 px-3 py-1.5 transition-colors hover:bg-surface-hover">
      <button
        disabled={branch.current || heldElsewhere || busy}
        onClick={onSwitch}
        title={
          branch.current
            ? 'Already on this branch'
            : heldElsewhere
              ? `Checked out in ${branch.checkedOut}`
              : `Switch to ${branch.name}`
        }
        className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
      >
        <span className="w-3.5 shrink-0">
          {busy ? (
            <Loader2 size={12} className="animate-spin-slow text-accent" />
          ) : branch.current ? (
            <Check size={12} className="text-clean" />
          ) : heldElsewhere ? (
            <Lock size={11} className="text-ink-faint" />
          ) : branch.remote ? (
            <Cloud size={11} className="text-ink-faint" />
          ) : null}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={
                'truncate font-mono text-[12px] ' +
                (branch.current ? 'text-accent' : heldElsewhere ? 'text-ink-faint' : 'text-ink-soft')
              }
            >
              {branch.name}
            </span>
            {branch.ahead > 0 && (
              <span className="flex shrink-0 items-center text-[10.5px] text-ahead">
                <ArrowUp size={9} />
                {branch.ahead}
              </span>
            )}
            {branch.behind > 0 && (
              <span className="flex shrink-0 items-center text-[10.5px] text-behind">
                <ArrowDown size={9} />
                {branch.behind}
              </span>
            )}
          </div>
          <div className="truncate text-[11px] text-ink-faint">
            {heldElsewhere ? `checked out in ${branch.checkedOut}` : branch.subject}
          </div>
        </div>

        <span className="shrink-0 text-[10.5px] text-ink-faint">{branch.age}</span>
      </button>

      {onDelete && !branch.current && (
        <button
          onClick={onDelete}
          title="Delete this branch"
          className="grid h-6 w-6 shrink-0 place-items-center rounded text-ink-faint opacity-0 transition-opacity hover:bg-[rgba(242,96,122,0.12)] hover:text-conflict group-hover:opacity-100"
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  )
}
