import { GitCommitHorizontal, GitMerge, Loader2 } from 'lucide-react'
import { useDetail } from '../store/detail'
import { DiffView } from './DiffView'

const kindMark: Record<string, { letter: string; cls: string }> = {
  added: { letter: 'A', cls: 'text-clean' },
  modified: { letter: 'M', cls: 'text-dirty' },
  deleted: { letter: 'D', cls: 'text-conflict' },
  renamed: { letter: 'R', cls: 'text-accent' },
  copied: { letter: 'C', cls: 'text-accent' },
  typechange: { letter: 'T', cls: 'text-behind' },
}

export function HistoryView() {
  return (
    <div className="flex min-h-0 flex-1">
      <CommitList />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col border-l border-line">
        <CommitHeader />
        <FileStrip />
        <div className="min-h-0 flex-1">
          <CommitDiff />
        </div>
      </div>
    </div>
  )
}

function CommitList() {
  const commits = useDetail((s) => s.commits)
  const sha = useDetail((s) => s.sha)
  const loading = useDetail((s) => s.commitsLoading)
  const exhausted = useDetail((s) => s.commitsExhausted)
  const select = useDetail((s) => s.selectCommit)
  const more = useDetail((s) => s.loadMoreCommits)

  return (
    <div className="w-[320px] shrink-0 overflow-y-auto">
      {commits.length === 0 &&
        (loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-[12.5px] text-ink-faint">
            <Loader2 size={14} className="animate-spin-slow" />
            Reading history…
          </div>
        ) : (
          <div className="px-4 py-10 text-center text-[12.5px] text-ink-faint">
            No commits on this branch yet.
          </div>
        ))}

      {commits.map((c) => {
        const active = c.sha === sha
        // git's decoration is a comma-joined list; the first two are enough.
        const refs = c.refs
          ? c.refs.split(',').map((r) => r.trim().replace(/^HEAD -> /, '')).slice(0, 2)
          : []

        return (
          <button
            key={c.sha}
            onClick={() => select(c.sha)}
            className={
              'flex w-full items-start gap-2 px-3 py-1.5 text-left transition-colors ' +
              (active ? 'bg-accent-dim' : 'hover:bg-surface-hover')
            }
          >
            <span className="mt-[3px] shrink-0 text-ink-faint">
              {c.parents > 1 ? <GitMerge size={11} /> : <GitCommitHorizontal size={11} />}
            </span>
            <div className="min-w-0 flex-1">
              <div
                className={'truncate text-[12px] ' + (active ? 'text-ink' : 'text-ink-soft')}
                title={c.subject}
              >
                {c.subject}
              </div>
              <div className="flex items-center gap-1.5 truncate text-[10.5px] text-ink-faint">
                <span className="font-mono">{c.short}</span>
                <span>·</span>
                <span className="truncate">{c.author}</span>
                <span>·</span>
                <span className="shrink-0">{c.age}</span>
              </div>
              {refs.length > 0 && (
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {refs.map((r) => (
                    <span
                      key={r}
                      className="rounded bg-[rgba(255,255,255,0.06)] px-1 font-mono text-[9.5px] text-ink-faint"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </button>
        )
      })}

      {commits.length > 0 && !exhausted && (
        <button
          onClick={more}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 border-t border-line py-2 text-[11.5px] text-ink-faint hover:bg-surface-hover hover:text-ink"
        >
          {loading && <Loader2 size={11} className="animate-spin-slow" />}
          Load 50 more
        </button>
      )}
    </div>
  )
}

function CommitHeader() {
  const detail = useDetail((s) => s.commitDetail)
  if (!detail?.commit?.sha) return null

  const c = detail.commit
  return (
    <div className="max-h-[40%] shrink-0 overflow-y-auto border-b border-line px-3 py-2">
      <div className="selectable text-[12.5px] text-ink">{c.subject}</div>
      {c.body?.trim() && (
        <pre className="selectable mt-1 whitespace-pre-wrap font-sans text-[11.5px] leading-snug text-ink-soft">
          {c.body.trim()}
        </pre>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-ink-faint">
        <span className="selectable font-mono">{c.sha.slice(0, 10)}</span>
        <span>·</span>
        <span>
          {c.author} &lt;{c.email}&gt;
        </span>
        <span>·</span>
        <span title={c.date}>{c.age}</span>
        {c.parents > 1 && (
          <>
            <span>·</span>
            <span className="text-accent">merge commit</span>
          </>
        )}
      </div>
    </div>
  )
}

function FileStrip() {
  const detail = useDetail((s) => s.commitDetail)
  const current = useDetail((s) => s.commitFile)
  const select = useDetail((s) => s.selectCommitFile)

  const files = detail?.files ?? []
  if (files.length === 0) return null

  return (
    <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-line px-2 py-1.5">
      {files.map((f) => {
        const mark = kindMark[f.kind] ?? kindMark.modified
        const active = f.path === current
        const name = f.path.split('/').pop()
        return (
          <button
            key={f.path}
            onClick={() => select(f.path)}
            title={f.orig ? `${f.orig} → ${f.path}` : f.path}
            className={
              'flex shrink-0 items-center gap-1.5 rounded px-2 py-0.5 text-[11.5px] transition-colors ' +
              (active ? 'bg-accent-dim text-accent' : 'text-ink-faint hover:bg-surface-hover hover:text-ink')
            }
          >
            <span className={'font-mono text-[10px] ' + mark.cls}>{mark.letter}</span>
            {name}
          </button>
        )
      })}
    </div>
  )
}

function CommitDiff() {
  const diff = useDetail((s) => s.commitDiff)
  const loading = useDetail((s) => s.commitDiffLoading)
  return <DiffView diff={diff} loading={loading} />
}
