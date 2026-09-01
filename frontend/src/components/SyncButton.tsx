import { ArrowDown, ArrowUp, CloudUpload, Loader2, RefreshCw, RefreshCwOff } from 'lucide-react'
import type { gitx } from '../../wailsjs/go/models'
import { useRepos, type Op } from '../store/repos'

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
  return { op: 'fetch', label: 'Fetch', hint: 'Check the remote for new commits' }
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
  // Anything that moves commits is worth emphasising; a plain fetch is not.
  const emphasised = primary.op !== 'fetch'

  return (
    <button
      disabled={busy}
      title={primary.hint}
      onClick={() => runOp(path, primary.op)}
      className={
        'flex h-7 w-[74px] shrink-0 items-center justify-center gap-1.5 rounded-md border text-[11.5px] font-medium transition-colors disabled:opacity-60 ' +
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
