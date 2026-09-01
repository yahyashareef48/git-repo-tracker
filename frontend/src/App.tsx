import { useEffect, useMemo } from 'react'
import {
  DownloadCloud,
  FolderPlus,
  FolderSearch,
  GitBranch,
  RefreshCw,
  Search,
  Terminal,
  TriangleAlert,
} from 'lucide-react'
import { GroupDialog } from './components/GroupDialog'
import { LogDrawer } from './components/LogDrawer'
import { RepoRow } from './components/RepoRow'
import { ScanDialog } from './components/ScanDialog'
import { TitleBar } from './components/TitleBar'
import { Toasts } from './components/Toasts'
import { filterRepos, UNGROUPED, useRepos, type RepoView } from './store/repos'

export default function App() {
  const init = useRepos((s) => s.init)
  const repos = useRepos((s) => s.repos)
  const env = useRepos((s) => s.env)
  const loading = useRepos((s) => s.loading)
  const query = useRepos((s) => s.query)
  const setQuery = useRepos((s) => s.setQuery)
  const refresh = useRepos((s) => s.refresh)
  const addRepo = useRepos((s) => s.addRepo)
  const startScan = useRepos((s) => s.startScan)
  const runOpAll = useRepos((s) => s.runOpAll)
  const toggleLog = useRepos((s) => s.toggleLog)
  const logCount = useRepos((s) => s.log.length)
  const logFailures = useRepos((s) => s.log.filter((e) => !e.ok).length)
  const busyCount = useRepos((s) => s.busy.size)
  const groups = useRepos((s) => s.groups)
  const groupFilter = useRepos((s) => s.groupFilter)
  const setGroupFilter = useRepos((s) => s.setGroupFilter)

  useEffect(() => {
    init()
  }, [init])

  // Refresh when the window regains focus: the user has almost certainly just
  // been running git in a terminal.
  useEffect(() => {
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  const filtered = useMemo(
    () => filterRepos(repos, groupFilter, query),
    [repos, groupFilter, query],
  )

  // With no group filter chosen, repos are shown under their group headings so
  // the grouping is visible without having to filter to see it.
  const sections = useMemo(() => {
    if (groupFilter) return [{ name: '', repos: filtered }]

    const byGroup = new Map<string, RepoView[]>()
    for (const r of filtered) {
      const key = r.group || ''
      const list = byGroup.get(key)
      list ? list.push(r) : byGroup.set(key, [r])
    }
    const named = [...byGroup.entries()]
      .filter(([name]) => name !== '')
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, list]) => ({ name, repos: list }))
    const rest = byGroup.get('') ?? []

    if (named.length === 0) return [{ name: '', repos: filtered }]
    return [...named, ...(rest.length ? [{ name: 'Ungrouped', repos: rest }] : [])]
  }, [filtered, groupFilter])

  const totals = useMemo(() => {
    let ahead = 0
    let dirty = 0
    for (const r of repos) {
      ahead += r.status.ahead || 0
      if (r.status.staged + r.status.unstaged + r.status.untracked > 0) dirty++
    }
    return { ahead, dirty }
  }, [repos])

  const ungroupedCount = repos.filter((r) => !r.group).length

  return (
    <div className="flex h-full flex-col bg-surface text-ink">
      <TitleBar
        right={
          <span className="text-[11.5px] text-ink-faint">
            {repos.length} repositor{repos.length === 1 ? 'y' : 'ies'}
          </span>
        }
      />

      {env && !env.gitFound && (
        <Banner>
          <TriangleAlert size={14} className="shrink-0 text-conflict" />
          <span>
            <b>git was not found on your PATH.</b> GitDeck shells out to git for everything, so
            nothing will work until it is installed.
          </span>
        </Banner>
      )}
      {env?.storeError && (
        <Banner>
          <TriangleAlert size={14} className="shrink-0 text-behind" />
          <span>Settings could not be saved: {env.storeError}</span>
        </Banner>
      )}

      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        <div className="relative flex-1">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name, path or branch…"
            className="selectable w-full rounded-md border border-line bg-[rgba(255,255,255,0.04)] py-1.5 pl-8 pr-3 text-[12.5px] text-ink outline-none placeholder:text-ink-faint focus:border-line-strong"
          />
        </div>

        <ToolbarButton onClick={addRepo} icon={<FolderPlus size={13} />} label="Add repo" />
        <ToolbarButton
          onClick={startScan}
          icon={<FolderSearch size={13} />}
          label="Scan folder"
        />
        <ToolbarButton
          onClick={() => runOpAll('fetch')}
          icon={<DownloadCloud size={13} className={busyCount > 0 ? 'animate-spin-slow' : ''} />}
          label={groupFilter ? 'Fetch group' : 'Fetch all'}
        />
        <ToolbarButton
          onClick={refresh}
          icon={<RefreshCw size={13} className={loading ? 'animate-spin-slow' : ''} />}
          label="Refresh"
        />
      </div>

      {groups.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line px-3 py-1.5">
          <GroupChip
            label="All"
            count={repos.length}
            active={groupFilter === ''}
            onClick={() => setGroupFilter('')}
          />
          {groups.map((g) => (
            <GroupChip
              key={g}
              label={g}
              count={repos.filter((r) => r.group === g).length}
              active={groupFilter === g}
              onClick={() => setGroupFilter(g)}
            />
          ))}
          {ungroupedCount > 0 && (
            <GroupChip
              label="Ungrouped"
              count={ungroupedCount}
              active={groupFilter === UNGROUPED}
              onClick={() => setGroupFilter(UNGROUPED)}
            />
          )}
        </div>
      )}

      <main className="min-h-0 flex-1 overflow-y-auto">
        {loading && repos.length === 0 ? (
          <LoadingState />
        ) : repos.length === 0 ? (
          <EmptyState onAdd={addRepo} onScan={startScan} />
        ) : filtered.length === 0 ? (
          <div className="px-4 py-16 text-center text-[12.5px] text-ink-faint">
            No repository matches this filter.
          </div>
        ) : (
          sections.map((section) => (
            <section key={section.name || '__all__'}>
              {section.name && (
                <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface-raised/90 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-ink-faint backdrop-blur">
                  {section.name}
                  <span className="text-ink-faint/70">{section.repos.length}</span>
                </div>
              )}
              {section.repos.map((r) => (
                <RepoRow key={r.path} repo={r} />
              ))}
            </section>
          ))
        )}
      </main>

      <LogDrawer />

      <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-line px-3 text-[11px] text-ink-faint">
        <span>{totals.dirty} with changes</span>
        <span>{totals.ahead} commits to push</span>
        <button
          onClick={toggleLog}
          title="Show the raw output of every git command GitDeck has run"
          className="flex items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-surface-hover hover:text-ink"
        >
          <Terminal size={11} />
          Git output
          {logCount > 0 && (
            <span className={logFailures > 0 ? 'text-conflict' : 'text-ink-faint'}>
              ({logCount}
              {logFailures > 0 ? `, ${logFailures} failed` : ''})
            </span>
          )}
        </button>
        {env?.gitVersion && <span className="ml-auto font-mono">git {env.gitVersion}</span>}
      </footer>

      <ScanDialog />
      <GroupDialog />
      <Toasts />
    </div>
  )
}

function GroupChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={
        'flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] transition-colors ' +
        (active
          ? 'border-accent/50 bg-accent-dim text-accent'
          : 'border-line text-ink-soft hover:border-line-strong hover:text-ink')
      }
    >
      {label}
      <span className={active ? 'text-accent/70' : 'text-ink-faint'}>{count}</span>
    </button>
  )
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-line bg-[rgba(242,96,122,0.08)] px-3 py-2 text-[12px] text-ink-soft">
      {children}
    </div>
  )
}

function ToolbarButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="flex shrink-0 items-center gap-1.5 rounded-md border border-line bg-[rgba(255,255,255,0.04)] px-2.5 py-1.5 text-[12.5px] text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
    >
      {icon}
      {label}
    </button>
  )
}

/** Skeleton rows: reading N repos costs a few git spawns each, so the first
 *  paint after launch is never instant. */
function LoadingState() {
  return (
    <div className="animate-fade-in">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-line px-4 py-3">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[rgba(255,255,255,0.12)]" />
          <div className="flex-1 space-y-1.5">
            <div
              className="h-2.5 rounded bg-[rgba(255,255,255,0.08)]"
              style={{ width: `${120 + ((i * 37) % 90)}px` }}
            />
            <div
              className="h-2 rounded bg-[rgba(255,255,255,0.05)]"
              style={{ width: `${200 + ((i * 53) % 140)}px` }}
            />
          </div>
          <div className="h-5 w-20 rounded-md bg-[rgba(255,255,255,0.06)]" />
        </div>
      ))}
    </div>
  )
}

function EmptyState({ onAdd, onScan }: { onAdd: () => void; onScan: () => void }) {
  return (
    <div className="grid h-full place-items-center px-6 py-16">
      <div className="max-w-[380px] text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-accent-dim">
          <GitBranch size={20} className="text-accent" />
        </div>
        <h2 className="mb-1.5 text-[15px] font-semibold">No repositories yet</h2>
        <p className="mb-5 text-[12.5px] leading-relaxed text-ink-faint">
          Add a single repository, or point GitDeck at a folder like{' '}
          <code className="font-mono text-ink-soft">C:\Users\you\Projects</code> and it will find
          every repo underneath.
        </p>
        <div className="flex justify-center gap-2">
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-medium text-[#0b0e14] hover:opacity-90"
          >
            <FolderPlus size={13} />
            Add repository
          </button>
          <button
            onClick={onScan}
            className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[12.5px] text-ink-soft hover:border-line-strong hover:text-ink"
          >
            <FolderSearch size={13} />
            Scan a folder
          </button>
        </div>
      </div>
    </div>
  )
}
