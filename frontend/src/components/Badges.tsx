import { ArrowDown, ArrowUp, Archive, CircleAlert, GitBranch, Pencil } from 'lucide-react'
import type { gitx } from '../../wailsjs/go/models'

type Status = gitx.Status

export function BranchPill({ status }: { status: Status }) {
  const isDefault = status.branch === status.defaultBranch
  return (
    <span
      title={status.upstream ? `tracking ${status.upstream}` : 'no upstream branch'}
      className={
        'inline-flex max-w-[220px] items-center gap-1.5 rounded-md px-2 py-[3px] text-[11.5px] font-medium ' +
        (isDefault
          ? 'bg-accent-dim text-accent'
          : 'bg-[rgba(255,255,255,0.06)] text-ink-soft')
      }
    >
      <GitBranch size={11} className="shrink-0" />
      <span className="truncate font-mono">{status.branch || '—'}</span>
      {!status.upstream && status.hasRemote && (
        <span className="shrink-0 text-[10px] text-ink-faint">·unpublished</span>
      )}
    </span>
  )
}

/** Ahead/behind, dirty-file and stash counters. Renders nothing when clean. */
export function Counters({ status }: { status: Status }) {
  const dirty = status.staged + status.unstaged + status.untracked

  return (
    <div className="flex items-center gap-1.5 text-[11.5px] tabular-nums">
      {status.conflicted > 0 && (
        <Chip title={`${status.conflicted} conflicted file(s)`} tone="conflict">
          <CircleAlert size={11} />
          {status.conflicted}
        </Chip>
      )}
      {dirty > 0 && (
        <Chip
          title={`${status.staged} staged · ${status.unstaged} modified · ${status.untracked} untracked`}
          tone="dirty"
        >
          <Pencil size={10} />
          {dirty}
        </Chip>
      )}
      {status.stashCount > 0 && (
        <Chip title={`${status.stashCount} stash entr(y|ies)`} tone="muted">
          <Archive size={10} />
          {status.stashCount}
        </Chip>
      )}
      {status.behind > 0 && (
        <Chip title={`${status.behind} commit(s) behind ${status.upstream}`} tone="behind">
          <ArrowDown size={11} />
          {status.behind}
        </Chip>
      )}
      {status.ahead > 0 && (
        <Chip title={`${status.ahead} commit(s) to push`} tone="ahead">
          <ArrowUp size={11} />
          {status.ahead}
        </Chip>
      )}
    </div>
  )
}

const tones = {
  ahead: 'text-ahead bg-[rgba(110,168,254,0.12)]',
  behind: 'text-behind bg-[rgba(240,184,73,0.12)]',
  dirty: 'text-dirty bg-[rgba(240,140,75,0.12)]',
  conflict: 'text-conflict bg-[rgba(242,96,122,0.14)]',
  muted: 'text-ink-faint bg-[rgba(255,255,255,0.05)]',
} as const

function Chip({
  children,
  title,
  tone,
}: {
  children: React.ReactNode
  title: string
  tone: keyof typeof tones
}) {
  return (
    <span
      title={title}
      className={'inline-flex items-center gap-1 rounded px-1.5 py-[2px] font-medium ' + tones[tone]}
    >
      {children}
    </span>
  )
}

/** A single dot summarising the repo's overall state. */
export function StatusDot({ status }: { status: Status }) {
  const dirty = status.staged + status.unstaged + status.untracked
  let colour = 'bg-clean'
  let label = 'clean and in sync'

  if (status.error) {
    colour = 'bg-conflict'
    label = status.error
  } else if (status.conflicted > 0) {
    colour = 'bg-conflict'
    label = 'conflicts'
  } else if (dirty > 0) {
    colour = 'bg-dirty'
    label = 'uncommitted changes'
  } else if (status.behind > 0) {
    colour = 'bg-behind'
    label = 'behind upstream'
  } else if (status.ahead > 0) {
    colour = 'bg-ahead'
    label = 'unpushed commits'
  }

  return <span title={label} className={'h-1.5 w-1.5 shrink-0 rounded-full ' + colour} />
}
