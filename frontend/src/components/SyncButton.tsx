import { ArrowDown, ArrowUp, CloudUpload, Loader2, RefreshCw, RefreshCwOff } from 'lucide-react'
import type { gitx } from '../../wailsjs/go/models'
import { remoteUsable, useRepos, type Op } from '../store/repos'

type Status = gitx.Status

/**
 * The one button that does the obvious thing. Which operation is "obvious"
 * depends on the repo's state, exactly as VS Code's sync button does:
 * publish when unpublished, pull when behind, push when ahead, sync when both.
 */
export function primaryOp(status: Status): { op: Op; label: string; hint: string } | null {
  if (status.error || !status.hasRemote) return null

  if (!status.upstream) {
    return {
      op: 'publish',
      label: 'Publish',
      hint: 'Push this branch and set its upstream',
    }
  }
  if (status.ahead > 0 && status.behind > 0) {
    return {
      op: 'sync',
      label: 'Sync',
      hint: `Pull ${status.behind}, then push ${status.ahead}`,
    }
  }
  if (status.behind > 0) {
    return { op: 'pull', label: 'Pull', hint: `Pull ${status.behind} commit(s)` }
  }
  if (status.ahead > 0) {
    return { op: 'push', label: 'Push', hint: `Push ${status.ahead} commit(s)` }
  }
  // Up to date as far as we know — but "as far as we know" is only as fresh as
  // the last fetch, so offer the full sync rather than a bare fetch.
  return {
    op: 'sync',
    label: 'Sync',
    hint: 'Fetch, then pull and push anything that turns up',
  }
}

const icons: Record<string, typeof RefreshCw> = {
  publish: CloudUpload,
  sync: RefreshCw,
  pull: ArrowDown,
  push: ArrowUp,
  fetch: RefreshCw,
}

export function SyncButton({ status, path }: { status: Status; path: string }) {
  const busy = useRepos((s) => s.busy.has(path))
  const runOp = useRepos((s) => s.runOp)
  const health = useRepos((s) => s.health)
  // With GitHub plainly unreachable, a remote op can only fail. Local work
  // (commit, stage, stash, branch) stays available.
  const blocked = !remoteUsable(health)

  const primary = primaryOp(status)

  if (!primary) {
    return (
      <span
        title={status.error ? status.error : 'This repository has no remote'}
        className="flex h-7 w-[74px] items-center justify-center gap-1.5 rounded-md text-[11.5px] text-ink-faint"
      >
        <RefreshCwOff size={12} />
        local
      </span>
    )
  }

  const Icon = icons[primary.op] ?? RefreshCw
  // Emphasise only when there is real work to do; an idle sync is not news.
  const emphasised = status.ahead > 0 || status.behind > 0 || !status.upstream

  return (
    <button
      disabled={busy || blocked}
      title={blocked ? (health?.message ?? 'GitHub is unreachable') : primary.hint}
      onClick={() => runOp(path, primary.op)}
      className={
        'flex h-7 w-[74px] shrink-0 items-center justify-center gap-1.5 rounded-md border text-[11.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ' +
        (emphasised
          ? 'border-accent/40 bg-accent-dim text-accent hover:bg-accent hover:text-[#0b0e14]'
          : 'border-line text-ink-soft hover:border-line-strong hover:text-ink')
      }
    >
      {busy ? (
        <Loader2 size={12} className="animate-spin-slow" />
      ) : (
        <Icon size={12} />
      )}
      {busy ? 'working' : primary.label}
    </button>
  )
}
