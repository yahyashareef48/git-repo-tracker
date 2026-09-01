import {
  ChevronRight,
  FolderOpen,
  MoreHorizontal,
  Pin,
  PinOff,
  RefreshCw,
  Terminal,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { OpenIn } from '../../wailsjs/go/main/App'
import type { gitx } from '../../wailsjs/go/models'
import { useRepos, type RepoView } from '../store/repos'
import { BranchPill, Counters, StatusDot } from './Badges'
import { Menu } from './Menu'

export function RepoRow({ repo }: { repo: RepoView }) {
  const expanded = useRepos((s) => s.expanded.has(repo.path))
  const busy = useRepos((s) => s.busy.has(repo.path))
  const toggleExpanded = useRepos((s) => s.toggleExpanded)
  const refreshOne = useRepos((s) => s.refreshOne)
  const removeRepo = useRepos((s) => s.removeRepo)
  const togglePin = useRepos((s) => s.togglePin)
  const toast = useRepos((s) => s.toast)

  const worktrees = repo.worktrees ?? []
  const hasChildren = worktrees.length > 0

  const open = async (target: string, path: string) => {
    try {
      await OpenIn(target, path)
    } catch (e) {
      toast('error', String(e))
    }
  }

  return (
    <div className="border-b border-line last:border-b-0">
      <div
        onClick={() => hasChildren && toggleExpanded(repo.path)}
        className={
          'group flex items-center gap-2 px-2 py-2 transition-colors hover:bg-surface-hover ' +
          (hasChildren ? 'cursor-pointer' : '')
        }
      >
        <button
          onClick={() => hasChildren && toggleExpanded(repo.path)}
          className={
            'grid h-5 w-5 shrink-0 place-items-center rounded text-ink-faint transition-transform ' +
            (hasChildren ? 'hover:text-ink ' : 'invisible ') +
            (expanded ? 'rotate-90' : '')
          }
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          <ChevronRight size={14} />
        </button>

        <StatusDot status={repo.status} />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-[13px] font-medium">{repo.name}</span>
            {repo.pinned && <Pin size={10} className="shrink-0 text-accent" />}
            {hasChildren && (
              <span className="shrink-0 rounded bg-[rgba(255,255,255,0.05)] px-1.5 text-[10px] text-ink-faint">
                {worktrees.length} worktree{worktrees.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="truncate font-mono text-[11px] text-ink-faint" title={repo.path}>
            {repo.path}
          </div>
        </div>

        {repo.status.error ? (
          <span
            className="flex items-center gap-1.5 rounded bg-[rgba(242,96,122,0.12)] px-2 py-1 text-[11.5px] text-conflict"
            title={repo.status.error}
          >
            <TriangleAlert size={12} />
            {repo.status.error}
          </span>
        ) : (
          <>
            <Counters status={repo.status} />
            <BranchPill status={repo.status} />
          </>
        )}

        {/* Actions must not trigger the row's expand/collapse. */}
        <div
          className="flex shrink-0 items-center gap-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <IconButton
            label="Refresh"
            onClick={() => refreshOne(repo.path)}
            spinning={busy}
          >
            <RefreshCw size={13} />
          </IconButton>

          <Menu
            trigger={({ toggle, open }) => (
              <button
                onClick={toggle}
                aria-label="More actions"
                className={
                  'grid h-7 w-7 place-items-center rounded text-ink-faint transition-colors hover:bg-surface-hover hover:text-ink ' +
                  (open ? 'bg-surface-hover text-ink' : '')
                }
              >
                <MoreHorizontal size={14} />
              </button>
            )}
            items={[
              {
                label: 'Open in VS Code',
                icon: <Terminal size={13} />,
                onSelect: () => open('vscode', repo.path),
              },
              {
                label: 'Reveal in Explorer',
                icon: <FolderOpen size={13} />,
                onSelect: () => open('explorer', repo.path),
              },
              {
                label: 'Open terminal here',
                icon: <Terminal size={13} />,
                onSelect: () => open('terminal', repo.path),
              },
              { kind: 'separator' },
              {
                label: repo.pinned ? 'Unpin' : 'Pin to top',
                icon: repo.pinned ? <PinOff size={13} /> : <Pin size={13} />,
                onSelect: () => togglePin(repo.path, !repo.pinned),
              },
              { kind: 'separator' },
              {
                label: 'Stop tracking',
                icon: <Trash2 size={13} />,
                danger: true,
                onSelect: () => {
                  // Untracking only edits GitDeck's own list; the folder and
                  // its history are never touched.
                  if (
                    window.confirm(
                      `Stop tracking "${repo.name}"?\n\nThis only removes it from GitDeck. Nothing is deleted from disk.`,
                    )
                  ) {
                    removeRepo(repo.path)
                  }
                },
              },
            ]}
          />
        </div>
      </div>

      {expanded && hasChildren && (
        <div className="animate-fade-in pb-1">
          {worktrees.map((wt) => (
            <WorktreeRow key={wt.path} status={wt} onOpen={open} />
          ))}
        </div>
      )}
    </div>
  )
}

function WorktreeRow({
  status,
  onOpen,
}: {
  status: gitx.Status
  onOpen: (target: string, path: string) => void
}) {
  return (
    <div className="group flex items-center gap-2 py-1.5 pl-9 pr-2 transition-colors hover:bg-surface-hover">
      {/* Tree elbow, so children read as belonging to the row above. */}
      <span className="-ml-3 mr-0.5 h-4 w-3 shrink-0 rounded-bl border-b border-l border-line" />
      <StatusDot status={status} />

      <div className="min-w-0 flex-1">
        <span className="truncate text-[12.5px] text-ink-soft">{status.name}</span>
      </div>

      <Counters status={status} />
      <BranchPill status={status} />

      <IconButton label="Reveal in Explorer" onClick={() => onOpen('explorer', status.path)}>
        <FolderOpen size={13} />
      </IconButton>
      <span className="w-7" />
    </div>
  )
}

function IconButton({
  children,
  label,
  onClick,
  spinning,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  spinning?: boolean
}) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      className="grid h-7 w-7 place-items-center rounded text-ink-faint transition-colors hover:bg-surface-hover hover:text-ink"
    >
      <span className={spinning ? 'animate-spin-slow' : ''}>{children}</span>
    </button>
  )
}
