import { useMemo, useState } from 'react'
import {
  Check,
  ChevronDown,
  Eye,
  Maximize2,
  RefreshCw,
  X,
} from 'lucide-react'
import { HideWindow } from '../../wailsjs/go/main/App'
import type { gitx } from '../../wailsjs/go/models'
import { useRepos, watchedRepos } from '../store/repos'
import { Counters, StatusDot } from './Badges'
import { SyncButton } from './SyncButton'

/**
 * The tray-side panel: the same window shrunk down, showing only the repos
 * worth watching. Deliberately not the whole app — it exists to answer "is
 * anything waiting for me" at a glance.
 */
export function MiniPanel() {
  const repos = useRepos((s) => s.repos)
  const settings = useRepos((s) => s.settings)
  const loading = useRepos((s) => s.loading)
  const refresh = useRepos((s) => s.refresh)
  const exitMini = useRepos((s) => s.exitMini)
  const runOpAll = useRepos((s) => s.runOpAll)
  const busy = useRepos((s) => s.busy.size > 0)

  const [pickerOpen, setPickerOpen] = useState(false)

  const watched = useMemo(() => watchedRepos(repos, settings), [repos, settings])

  const totals = useMemo(() => {
    let ahead = 0
    let behind = 0
    let dirty = 0
    // Worktrees are separate checkouts with their own branch and their own
    // uncommitted work, so they count towards the totals like any repo.
    const every = watched.flatMap((r) => [r.status, ...(r.worktrees ?? [])])
    for (const st of every) {
      ahead += st.ahead || 0
      behind += st.behind || 0
      if (st.staged + st.unstaged + st.untracked > 0) dirty++
    }
    return { ahead, behind, dirty, rows: every.length }
  }, [watched])

  const scopeLabel =
    !settings || settings.watchMode === 'all'
      ? 'All repositories'
      : settings.watchMode === 'group'
        ? settings.watchGroup || 'group'
        : `${settings.watchPaths?.length ?? 0} picked`

  return (
    <div className="flex h-full flex-col bg-surface-solid text-ink">
      <header className="drag flex h-9 shrink-0 items-center gap-2 border-b border-line px-2">
        <span className="pl-1 text-[12.5px] font-semibold">GitDeck</span>

        <button
          onClick={() => setPickerOpen((v) => !v)}
          title="Choose what this panel watches"
          className="no-drag flex min-w-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-ink-faint hover:bg-surface-hover hover:text-ink"
        >
          <Eye size={10} />
          <span className="truncate">{scopeLabel}</span>
          <ChevronDown size={10} />
        </button>

        <div className="no-drag ml-auto flex items-center">
          <IconButton label="Refresh" onClick={refresh}>
            <RefreshCw size={12} className={loading ? 'animate-spin-slow' : ''} />
          </IconButton>
          <IconButton label="Open the full window" onClick={exitMini}>
            <Maximize2 size={12} />
          </IconButton>
          <IconButton label="Hide to tray" onClick={() => HideWindow()}>
            <X size={13} />
          </IconButton>
        </div>
      </header>

      {pickerOpen && <ScopePicker onDone={() => setPickerOpen(false)} />}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {watched.length === 0 ? (
          <div className="px-4 py-10 text-center text-[12px] text-ink-faint">
            Nothing being watched. Use the eye above to pick repositories or a group.
          </div>
        ) : (
          watched.map((r) => (
            <div key={r.path}>
              <Row name={r.name} path={r.path} status={r.status} />
              {/* Worktrees are always shown here rather than hidden behind a
                  chevron: this panel exists to say what is happening, and a
                  worktree is where half the work usually is. */}
              {(r.worktrees ?? []).map((wt, i, all) => (
                <Row
                  key={wt.path}
                  name={wt.name}
                  path={wt.path}
                  status={wt}
                  nested
                  last={i === all.length - 1}
                />
              ))}
            </div>
          ))
        )}
      </div>

      <footer className="flex h-8 shrink-0 items-center gap-2 border-t border-line px-2 text-[11px] text-ink-faint">
        <span>{totals.rows} watched</span>
        {totals.ahead > 0 && <span className="text-ahead">↑{totals.ahead}</span>}
        {totals.behind > 0 && <span className="text-behind">↓{totals.behind}</span>}
        {totals.dirty > 0 && <span className="text-dirty">{totals.dirty} dirty</span>}

        <button
          onClick={() => runOpAll('sync')}
          disabled={busy || watched.length === 0}
          className="ml-auto flex items-center gap-1 rounded border border-line px-2 py-0.5 transition-colors hover:border-line-strong hover:text-ink disabled:opacity-40"
        >
          <RefreshCw size={10} className={busy ? 'animate-spin-slow' : ''} />
          Sync watched
        </button>
      </footer>
    </div>
  )
}

/** One line: status dot, name, branch, counters, sync. Nested rows hang off a
 *  rail so a worktree reads as belonging to the repo above it. */
function Row({
  name,
  path,
  status,
  nested,
  last,
}: {
  name: string
  path: string
  status: gitx.Status
  nested?: boolean
  last?: boolean
}) {
  return (
    <div
      title={`${path}
${status.branch}`}
      className={
        'relative flex items-center gap-1.5 py-[3px] pr-2 hover:bg-surface-hover ' +
        (nested ? 'pl-[26px]' : 'pl-2')
      }
    >
      {nested && (
        <>
          <span
            className="pointer-events-none absolute left-[11px] top-0 w-px bg-line-strong"
            style={{ height: last ? 11 : '100%' }}
          />
          <span className="pointer-events-none absolute left-[11px] top-[11px] h-px w-[9px] bg-line-strong" />
        </>
      )}

      <StatusDot status={status} />
      <span
        className={
          'min-w-0 shrink truncate text-[12px] ' + (nested ? 'text-ink-soft' : '')
        }
      >
        {name}
      </span>
      <span className="min-w-0 shrink truncate font-mono text-[10.5px] text-ink-faint">
        {status.branch}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-1">
        <Counters status={status} />
        <SyncButton status={status} path={path} compact />
      </span>
    </div>
  )
}

/** Chooses between all repos, one group, or a hand-picked set. */
function ScopePicker({ onDone }: { onDone: () => void }) {
  const repos = useRepos((s) => s.repos)
  const groups = useRepos((s) => s.groups)
  const settings = useRepos((s) => s.settings)
  const save = useRepos((s) => s.saveSettings)

  const mode = settings?.watchMode ?? 'all'
  const picked = new Set(settings?.watchPaths ?? [])

  const togglePath = (path: string) => {
    const next = new Set(picked)
    next.has(path) ? next.delete(path) : next.add(path)
    save({ watchMode: 'picked', watchPaths: [...next] })
  }

  return (
    <div className="max-h-[260px] shrink-0 overflow-y-auto border-b border-line bg-[rgba(255,255,255,0.03)]">
      <Option
        label="All repositories"
        active={mode === 'all'}
        onClick={() => {
          save({ watchMode: 'all' })
          onDone()
        }}
      />

      {groups.length > 0 && <Heading>Groups</Heading>}
      {groups.map((g) => (
        <Option
          key={g}
          label={g}
          hint={`${repos.filter((r) => r.group === g).length} repos`}
          active={mode === 'group' && settings?.watchGroup === g}
          onClick={() => {
            save({ watchMode: 'group', watchGroup: g })
            onDone()
          }}
        />
      ))}

      <Heading>Pick repositories</Heading>
      {repos.map((r) => (
        <Option
          key={r.path}
          label={r.name}
          hint={r.group}
          active={mode === 'picked' && picked.has(r.path)}
          onClick={() => togglePath(r.path)}
        />
      ))}
    </div>
  )
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pb-0.5 pt-1.5 text-[10px] uppercase tracking-wide text-ink-faint">
      {children}
    </div>
  )
}

function Option({
  label,
  hint,
  active,
  onClick,
}: {
  label: string
  hint?: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 px-2 py-1 text-left text-[12px] transition-colors hover:bg-surface-hover"
    >
      <span
        className={
          'grid h-3.5 w-3.5 shrink-0 place-items-center rounded border ' +
          (active ? 'border-accent bg-accent text-[#0b0e14]' : 'border-line-strong')
        }
      >
        {active && <Check size={9} strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1 truncate text-ink-soft">{label}</span>
      {hint && <span className="shrink-0 text-[10.5px] text-ink-faint">{hint}</span>}
    </button>
  )
}

function IconButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center text-ink-faint transition-colors hover:bg-surface-hover hover:text-ink"
    >
      {children}
    </button>
  )
}
