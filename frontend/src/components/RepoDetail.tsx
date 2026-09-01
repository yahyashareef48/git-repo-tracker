import { useEffect, useState } from 'react'
import {
  Archive,
  ArrowLeft,
  Check,
  FilePlus2,
  FileX2,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  Undo2,
} from 'lucide-react'
import type { gitx } from '../../wailsjs/go/models'
import { useDetail, type FileRef } from '../store/detail'
import { useRepos } from '../store/repos'
import { BranchPill } from './Badges'
import { DiffView } from './DiffView'
import { HistoryView } from './HistoryView'
import { Menu, type MenuItem } from './Menu'

type Change = gitx.Change

export function RepoDetail() {
  const open = useDetail((s) => s.open)
  const detail = useDetail((s) => s.detail)
  const loading = useDetail((s) => s.loading)
  const close = useDetail((s) => s.close)
  const tab = useDetail((s) => s.tab)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      // Esc closes, unless the user is mid-sentence in the commit box.
      if (e.key === 'Escape' && !(e.target as HTMLElement)?.closest('textarea')) close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, close])

  if (!open) return null

  return (
    <div className="animate-fade-in absolute inset-0 z-30 flex flex-col bg-surface-solid">
      <DetailHeader />
      {loading && !detail ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-[12.5px] text-ink-faint">
          <Loader2 size={16} className="animate-spin-slow" />
          Reading working tree…
        </div>
      ) : tab === 'history' ? (
        <HistoryView />
      ) : (
        <div className="flex min-h-0 flex-1">
          <FilePanel />
          <div className="min-w-0 flex-1 border-l border-line">
            <DiffPane />
          </div>
        </div>
      )}
      {tab === 'changes' && <CommitBar />}
    </div>
  )
}

function DetailHeader() {
  const detail = useDetail((s) => s.detail)
  const close = useDetail((s) => s.close)
  const reload = useDetail((s) => s.reload)
  const loading = useDetail((s) => s.loading)
  const tab = useDetail((s) => s.tab)
  const setTab = useDetail((s) => s.setTab)
  const openBranchPicker = useRepos((s) => s.openBranchPicker)
  const repoPath = useDetail((s) => s.repoPath)

  const counts = detail?.changes
  const changeCount =
    (counts?.staged?.length ?? 0) +
    (counts?.unstaged?.length ?? 0) +
    (counts?.untracked?.length ?? 0) +
    (counts?.conflicted?.length ?? 0)

  return (
    <header className="flex h-11 shrink-0 items-center gap-2.5 border-b border-line px-2">
      <button
        onClick={close}
        title="Back to the repository list (Esc)"
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] text-ink-soft transition-colors hover:bg-surface-hover hover:text-ink"
      >
        <ArrowLeft size={14} />
        Back
      </button>

      <span className="text-[13px] font-semibold">{detail?.name}</span>

      {detail && (
        <button
          onClick={() => openBranchPicker(repoPath)}
          title="Switch or create a branch"
          className="rounded transition-opacity hover:opacity-80"
        >
          <BranchPill status={detail.status} />
        </button>
      )}

      <div className="ml-auto flex items-center gap-1">
        <TabButton active={tab === 'changes'} onClick={() => setTab('changes')}>
          Changes {changeCount > 0 && <Count>{changeCount}</Count>}
        </TabButton>
        <TabButton active={tab === 'history'} onClick={() => setTab('history')}>
          History
        </TabButton>

        <button
          onClick={reload}
          title="Re-read the working tree"
          className="ml-1 grid h-7 w-7 place-items-center rounded text-ink-faint hover:bg-surface-hover hover:text-ink"
        >
          <RotateCcw size={13} className={loading ? 'animate-spin-slow' : ''} />
        </button>
      </div>
    </header>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={
        'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12.5px] transition-colors ' +
        (active ? 'bg-surface-hover text-ink' : 'text-ink-faint hover:text-ink')
      }
    >
      {children}
    </button>
  )
}

function Count({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-[rgba(255,255,255,0.08)] px-1 text-[10.5px] text-ink-faint">
      {children}
    </span>
  )
}

function FilePanel() {
  const detail = useDetail((s) => s.detail)
  const stage = useDetail((s) => s.stage)
  const unstage = useDetail((s) => s.unstage)

  const c = detail?.changes
  const staged = c?.staged ?? []
  const unstaged = c?.unstaged ?? []
  const untracked = c?.untracked ?? []
  const conflicted = c?.conflicted ?? []
  const empty =
    staged.length + unstaged.length + untracked.length + conflicted.length === 0

  return (
    <div className="flex w-[320px] shrink-0 flex-col overflow-y-auto">
      {c?.error && (
        <div className="px-3 py-2 text-[12px] text-conflict">{c.error}</div>
      )}

      {empty && !c?.error && (
        <div className="px-4 py-10 text-center text-[12.5px] text-ink-faint">
          Nothing has changed in this working tree.
        </div>
      )}

      {conflicted.length > 0 && (
        <Section title="Conflicts" count={conflicted.length}>
          {conflicted.map((f) => (
            <FileRow key={'c' + f.path} change={f} />
          ))}
        </Section>
      )}

      {staged.length > 0 && (
        <Section
          title="Staged changes"
          count={staged.length}
          action={{
            label: 'Unstage all',
            icon: <Minus size={12} />,
            run: () => unstage([]),
          }}
        >
          {staged.map((f) => (
            <FileRow key={'s' + f.path} change={f} />
          ))}
        </Section>
      )}

      {unstaged.length > 0 && (
        <Section
          title="Changes"
          count={unstaged.length}
          action={{
            label: 'Stage all',
            icon: <Plus size={12} />,
            run: () => stage(unstaged.map((f) => f.path)),
          }}
        >
          {unstaged.map((f) => (
            <FileRow key={'u' + f.path} change={f} />
          ))}
        </Section>
      )}

      {untracked.length > 0 && (
        <Section
          title="Untracked"
          count={untracked.length}
          action={{
            label: 'Stage all',
            icon: <Plus size={12} />,
            run: () => stage(untracked.map((f) => f.path)),
          }}
        >
          {untracked.map((f) => (
            <FileRow key={'n' + f.path} change={f} />
          ))}
        </Section>
      )}

      <StashSection />
    </div>
  )
}

function Section({
  title,
  count,
  action,
  children,
}: {
  title: string
  count: number
  action?: { label: string; icon: React.ReactNode; run: () => void }
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="group sticky top-0 z-10 flex items-center gap-2 border-y border-line bg-surface-raised px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-ink-faint backdrop-blur">
        {title}
        <span className="text-ink-faint/70">{count}</span>
        {action && (
          <button
            onClick={action.run}
            title={action.label}
            className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 normal-case tracking-normal opacity-0 transition-opacity hover:bg-surface-hover hover:text-ink group-hover:opacity-100"
          >
            {action.icon}
            {action.label}
          </button>
        )}
      </div>
      {children}
    </section>
  )
}

const kindMark: Record<string, { letter: string; cls: string; title: string }> = {
  added: { letter: 'A', cls: 'text-clean', title: 'added' },
  modified: { letter: 'M', cls: 'text-dirty', title: 'modified' },
  deleted: { letter: 'D', cls: 'text-conflict', title: 'deleted' },
  renamed: { letter: 'R', cls: 'text-accent', title: 'renamed' },
  copied: { letter: 'C', cls: 'text-accent', title: 'copied' },
  typechange: { letter: 'T', cls: 'text-behind', title: 'type changed' },
  untracked: { letter: 'U', cls: 'text-ink-faint', title: 'untracked' },
  conflicted: { letter: '!', cls: 'text-conflict', title: 'conflicted' },
}

function FileRow({ change }: { change: Change }) {
  const selected = useDetail((s) => s.file)
  const selectFile = useDetail((s) => s.selectFile)
  const stage = useDetail((s) => s.stage)
  const unstage = useDetail((s) => s.unstage)
  const discard = useDetail((s) => s.discard)

  const untracked = change.kind === 'untracked'
  const ref: FileRef = { path: change.path, staged: !!change.staged, untracked }
  const active = selected?.path === change.path && selected.staged === ref.staged

  const mark = kindMark[change.kind] ?? kindMark.modified
  const slash = change.path.lastIndexOf('/')
  const dir = slash >= 0 ? change.path.slice(0, slash + 1) : ''
  const name = slash >= 0 ? change.path.slice(slash + 1) : change.path

  const items: MenuItem[] = change.staged
    ? [{ label: 'Unstage', icon: <Minus size={13} />, onSelect: () => unstage([change.path]) }]
    : [
        { label: 'Stage', icon: <Plus size={13} />, onSelect: () => stage([change.path]) },
        {
          label: untracked ? 'Delete file' : 'Discard changes',
          icon: untracked ? <FileX2 size={13} /> : <Undo2 size={13} />,
          danger: true,
          onSelect: () => {
            const msg = untracked
              ? `Delete "${change.path}"?\n\nThis file is untracked, so it is removed from disk and cannot be recovered by git.`
              : `Discard changes to "${change.path}"?\n\nThis cannot be undone.`
            if (window.confirm(msg)) discard([change.path], untracked)
          },
        },
      ]

  return (
    <div
      onClick={() => selectFile(ref)}
      className={
        'group flex cursor-pointer items-center gap-2 px-3 py-1 transition-colors ' +
        (active ? 'bg-accent-dim' : 'hover:bg-surface-hover')
      }
    >
      <span
        title={mark.title}
        className={'w-3 shrink-0 text-center font-mono text-[11px] ' + mark.cls}
      >
        {mark.letter}
      </span>

      <div className="min-w-0 flex-1 truncate text-[12px]" title={change.path}>
        {dir && <span className="text-ink-faint">{dir}</span>}
        <span className={active ? 'text-ink' : 'text-ink-soft'}>{name}</span>
      </div>

      <div className="flex shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
        <button
          title={change.staged ? 'Unstage' : 'Stage'}
          onClick={() => (change.staged ? unstage([change.path]) : stage([change.path]))}
          className="grid h-5 w-5 place-items-center rounded text-ink-faint opacity-0 transition-opacity hover:bg-surface-hover hover:text-ink group-hover:opacity-100"
        >
          {change.staged ? <Minus size={12} /> : <Plus size={12} />}
        </button>

        <Menu
          align="right"
          trigger={({ toggle }) => (
            <button
              onClick={toggle}
              aria-label="File actions"
              className="grid h-5 w-5 place-items-center rounded text-ink-faint opacity-0 transition-opacity hover:bg-surface-hover hover:text-ink group-hover:opacity-100"
            >
              ⋯
            </button>
          )}
          items={items}
        />
      </div>
    </div>
  )
}

function StashSection() {
  const detail = useDetail((s) => s.detail)
  const act = useDetail((s) => s.stashAction)
  const stashes = detail?.stashes ?? []

  if (stashes.length === 0) return null

  return (
    <Section title="Stashes" count={stashes.length}>
      {stashes.map((s) => (
        <div
          key={s.ref}
          className="group flex items-center gap-2 px-3 py-1 hover:bg-surface-hover"
        >
          <Archive size={11} className="shrink-0 text-ink-faint" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] text-ink-soft" title={s.subject}>
              {s.subject}
            </div>
            <div className="font-mono text-[10.5px] text-ink-faint">
              {s.ref} · {s.age}
            </div>
          </div>
          <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <MiniButton onClick={() => act('pop', s.ref)}>Pop</MiniButton>
            <MiniButton onClick={() => act('apply', s.ref)}>Apply</MiniButton>
            <MiniButton
              danger
              onClick={() => {
                if (window.confirm(`Drop ${s.ref}?\n\nThe stashed changes are lost.`)) {
                  act('drop', s.ref)
                }
              }}
            >
              Drop
            </MiniButton>
          </div>
        </div>
      ))}
    </Section>
  )
}

function MiniButton({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={
        'rounded border border-line px-1.5 py-0.5 text-[10.5px] transition-colors hover:border-line-strong ' +
        (danger ? 'text-conflict' : 'text-ink-soft hover:text-ink')
      }
    >
      {children}
    </button>
  )
}

function DiffPane() {
  const file = useDetail((s) => s.file)
  const diff = useDetail((s) => s.diff)
  const diffLoading = useDetail((s) => s.diffLoading)

  return (
    <div className="flex h-full flex-col">
      {file && (
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-1.5">
          <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink-soft">
            {file.path}
          </span>
          <span className="shrink-0 rounded bg-[rgba(255,255,255,0.05)] px-1.5 py-0.5 text-[10.5px] text-ink-faint">
            {file.staged ? 'staged' : file.untracked ? 'untracked' : 'working tree'}
          </span>
        </div>
      )}
      <div className="min-h-0 flex-1">
        <DiffView diff={diff} loading={diffLoading} />
      </div>
    </div>
  )
}

function CommitBar() {
  const detail = useDetail((s) => s.detail)
  const message = useDetail((s) => s.message)
  const setMessage = useDetail((s) => s.setMessage)
  const amend = useDetail((s) => s.amend)
  const toggleAmend = useDetail((s) => s.toggleAmend)
  const commit = useDetail((s) => s.commit)
  const stage = useDetail((s) => s.stage)
  const stash = useDetail((s) => s.stash)
  const undoCommit = useDetail((s) => s.undoCommit)
  const busy = useDetail((s) => s.busy)

  const [stashOpen, setStashOpen] = useState(false)

  const staged = detail?.changes.staged ?? []
  const unstaged = detail?.changes.unstaged ?? []
  const untracked = detail?.changes.untracked ?? []
  const nothingStaged = staged.length === 0
  const canCommit = message.trim().length > 0 && (!nothingStaged || amend) && !busy

  return (
    <div className="shrink-0 border-t border-line px-3 py-2">
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          // Ctrl+Enter commits, the same chord VS Code uses.
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canCommit) commit()
        }}
        rows={2}
        placeholder={
          amend ? 'Amend the last commit…' : 'Commit message (Ctrl+Enter to commit)'
        }
        className="selectable w-full resize-none rounded-md border border-line bg-[rgba(255,255,255,0.04)] px-2.5 py-1.5 text-[12.5px] leading-snug text-ink outline-none placeholder:text-ink-faint focus:border-line-strong"
      />

      <div className="mt-2 flex items-center gap-2">
        <label
          title="Replace the previous commit instead of adding a new one"
          className="flex cursor-pointer items-center gap-1.5 text-[11.5px] text-ink-faint hover:text-ink"
        >
          <span
            className={
              'grid h-3.5 w-3.5 place-items-center rounded border ' +
              (amend ? 'border-accent bg-accent text-[#0b0e14]' : 'border-line-strong')
            }
          >
            {amend && <Check size={9} strokeWidth={3} />}
          </span>
          <input type="checkbox" checked={amend} onChange={toggleAmend} className="hidden" />
          Amend
        </label>

        {nothingStaged && (unstaged.length > 0 || untracked.length > 0) && (
          <button
            onClick={() => stage([])}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px] text-ink-faint hover:bg-surface-hover hover:text-ink"
          >
            <FilePlus2 size={11} />
            Stage all
          </button>
        )}

        <button
          onClick={() => setStashOpen((v) => !v)}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px] text-ink-faint hover:bg-surface-hover hover:text-ink"
        >
          <Archive size={11} />
          Stash
        </button>

        {detail?.status.lastCommit && (
          <button
            onClick={() => {
              const msg =
                `Undo the last commit?\n\n"${detail.status.lastCommit}"\n\n` +
                'The commit is removed but its changes stay staged.'
              if (window.confirm(msg)) undoCommit()
            }}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px] text-ink-faint hover:bg-surface-hover hover:text-ink"
          >
            <Undo2 size={11} />
            Undo last commit
          </button>
        )}

        <button
          onClick={commit}
          disabled={!canCommit}
          title={
            nothingStaged && !amend
              ? 'Stage something first'
              : 'Commit the staged changes (Ctrl+Enter)'
          }
          className="ml-auto flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-medium text-[#0b0e14] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? <Loader2 size={12} className="animate-spin-slow" /> : <Check size={13} />}
          {amend ? 'Amend' : 'Commit'}
          {staged.length > 0 && ` ${staged.length}`}
        </button>
      </div>

      {stashOpen && (
        <StashForm
          onCancel={() => setStashOpen(false)}
          onSubmit={(msg, includeUntracked) => {
            setStashOpen(false)
            stash(msg, includeUntracked)
          }}
        />
      )}
    </div>
  )
}

function StashForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void
  onSubmit: (message: string, includeUntracked: boolean) => void
}) {
  const [msg, setMsg] = useState('')
  const [withUntracked, setWithUntracked] = useState(false)

  return (
    <div className="mt-2 flex items-center gap-2 rounded-md border border-line bg-[rgba(255,255,255,0.03)] px-2 py-1.5">
      <input
        autoFocus
        value={msg}
        onChange={(e) => setMsg(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit(msg, withUntracked)
          if (e.key === 'Escape') onCancel()
        }}
        placeholder="Stash message (optional)"
        className="selectable min-w-0 flex-1 bg-transparent text-[12px] text-ink outline-none placeholder:text-ink-faint"
      />
      <label className="flex cursor-pointer items-center gap-1.5 text-[11.5px] text-ink-faint hover:text-ink">
        <input
          type="checkbox"
          checked={withUntracked}
          onChange={(e) => setWithUntracked(e.target.checked)}
        />
        include untracked
      </label>
      <MiniButton onClick={() => onSubmit(msg, withUntracked)}>Stash</MiniButton>
      <MiniButton onClick={onCancel}>Cancel</MiniButton>
    </div>
  )
}
