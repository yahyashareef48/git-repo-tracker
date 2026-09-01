import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  CloudUpload,
  Code2,
  DownloadCloud,
  FolderOpen,
  FolderTree,
  GitMerge,
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
import { remoteUsable, useRepos, type RepoView } from '../store/repos'
import { BranchPill, Counters, StatusDot } from './Badges'
import { Menu, type MenuItem } from './Menu'
import { SyncButton } from './SyncButton'

export function RepoRow({ repo }: { repo: RepoView }) {
  const expanded = useRepos((s) => s.expanded.has(repo.path))
  const busy = useRepos((s) => s.busy.has(repo.path))
  const toggleExpanded = useRepos((s) => s.toggleExpanded)
  const refreshOne = useRepos((s) => s.refreshOne)
  const removeRepo = useRepos((s) => s.removeRepo)
  const togglePin = useRepos((s) => s.togglePin)
  const runOp = useRepos((s) => s.runOp)
  const openGroupDialog = useRepos((s) => s.openGroupDialog)
  const selected = useRepos((s) => s.selected.has(repo.path))
  const anySelected = useRepos((s) => s.selected.size > 0)
  const toggleSelected = useRepos((s) => s.toggleSelected)
  const health = useRepos((s) => s.health)
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

  // Only offer what this repo can actually do: an already-published branch has
  // nothing to publish, and a repo with no remote has nothing to fetch from.
  const remote = repo.status.hasRemote && !repo.status.error
  const published = !!repo.status.upstream
  // Remote ops are shown but disabled when GitHub is down, so the menu does not
  // silently change shape and the tooltip can say why.
  const offline = !remoteUsable(health)
  const why = offline ? (health?.message ?? 'GitHub is unreachable') : undefined

  const menuItems: MenuItem[] = []
  if (remote) {
    menuItems.push(
      {
        label: 'Fetch',
        icon: <DownloadCloud size={13} />,
        disabled: offline,
        title: why,
        onSelect: () => runOp(repo.path, 'fetch'),
      },
      {
        label: 'Pull',
        icon: <ArrowDown size={13} />,
        disabled: offline,
        title: why,
        onSelect: () => runOp(repo.path, 'pull'),
      },
      {
        label: 'Push',
        icon: <ArrowUp size={13} />,
        disabled: offline,
        title: why,
        onSelect: () => runOp(repo.path, 'push'),
      },
      {
        label: 'Sync',
        icon: <RefreshCw size={13} />,
        disabled: offline,
        title: why,
        onSelect: () => runOp(repo.path, 'sync'),
      },
      {
        label: `Pull from ${repo.status.defaultBranch || 'main'}`,
        icon: <GitMerge size={13} />,
        disabled: offline,
        title: why,
        onSelect: () => runOp(repo.path, 'pull-from-main'),
      },
    )
    if (!published) {
      menuItems.push({
        label: 'Publish branch',
        icon: <CloudUpload size={13} />,
        disabled: offline,
        title: why,
        onSelect: () => runOp(repo.path, 'publish'),
      })
    }
    menuItems.push({ kind: 'separator' })
  }

  menuItems.push(
    {
      label: 'Open in VS Code',
      icon: <Code2 size={13} />,
      onSelect: () => open('vscode', repo.path),
    },
    {
      label: 'Reveal in Explorer',
      icon: <FolderOpen size={13} />,
      onSelect: () => open('explorer', repo.path),
    },
    {
      label: 'Open terminal',
      icon: <Terminal size={13} />,
      onSelect: () => open('terminal', repo.path),
    },
    { kind: 'separator' },
    {
      label: repo.group ? `Group: ${repo.group}` : 'Move to group…',
      icon: <FolderTree size={13} />,
      onSelect: () => openGroupDialog([repo.path]),
    },
    {
      label: repo.pinned ? 'Unpin' : 'Pin to top',
      icon: repo.pinned ? <PinOff size={13} /> : <Pin size={13} />,
      onSelect: () => togglePin(repo.path, !repo.pinned),
    },
    {
      label: 'Stop tracking',
      icon: <Trash2 size={13} />,
      danger: true,
      onSelect: () => {
        // Untracking only edits GitDeck's own list; the folder and its history
        // are never touched.
        const msg =
          `Stop tracking "${repo.name}"?\n\n` +
          'This only removes it from GitDeck. Nothing is deleted from disk.'
        if (window.confirm(msg)) removeRepo(repo.path)
      },
    },
  )

  return (
    <div className="border-b border-line last:border-b-0">
      <div
        onClick={() => hasChildren && toggleExpanded(repo.path)}
        className={
          'group flex items-center gap-2 px-2 py-2 transition-colors hover:bg-surface-hover ' +
          (hasChildren ? 'cursor-pointer' : '')
        }
      >
        {/* Ticking rows is how you build an ad-hoc set: filter to it, or group
            it in one go. Hidden until hovered so the list stays calm. */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            toggleSelected(repo.path)
          }}
          aria-label={selected ? 'Deselect' : 'Select'}
          title={selected ? 'Deselect' : 'Select'}
          className={
            'grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors ' +
            (selected
              ? 'border-accent bg-accent text-[#0b0e14]'
              : 'border-line-strong text-transparent hover:border-accent ') +
            (selected || anySelected ? '' : ' opacity-0 group-hover:opacity-100')
          }
        >
          {selected && <Check size={11} strokeWidth={3} />}
        </button>

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
            {repo.group && (
              <span className="shrink-0 rounded bg-accent-dim px-1.5 text-[10px] text-accent">
                {repo.group}
              </span>
            )}
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
            className="flex max-w-[240px] items-center gap-1.5 rounded bg-[rgba(242,96,122,0.12)] px-2 py-1 text-[11.5px] text-conflict"
            title={repo.status.error}
          >
            <TriangleAlert size={12} className="shrink-0" />
            <span className="truncate">{repo.status.error}</span>
          </span>
        ) : (
          <>
            <Counters status={repo.status} />
            <BranchPill status={repo.status} />
          </>
        )}

        {/* Actions must not trigger the row's expand/collapse. */}
        <div
          className="flex shrink-0 items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <SyncButton status={repo.status} path={repo.path} />

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
            items={menuItems}
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

      <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <SyncButton status={status} path={status.path} />
        <IconButton label="Reveal in Explorer" onClick={() => onOpen('explorer', status.path)}>
          <FolderOpen size={13} />
        </IconButton>
        <span className="w-7" />
      </div>
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
