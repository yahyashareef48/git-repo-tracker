import { Check, Loader2, X } from 'lucide-react'
import { opLabel, useRepos } from '../store/repos'

/**
 * Progress for a multi-repo run. One failing repo must not hide the rest, so
 * every result stays on screen until dismissed rather than flashing past as a
 * toast.
 */
export function BulkStrip() {
  const bulk = useRepos((s) => s.bulk)
  const dismiss = useRepos((s) => s.dismissBulk)
  const logOpen = useRepos((s) => s.logOpen)
  const toggleLog = useRepos((s) => s.toggleLog)
  const openLog = () => {
    if (!logOpen) toggleLog()
  }

  if (!bulk) return null

  const running = bulk.done < bulk.total
  const failed = bulk.results.filter((r) => !r.ok)

  return (
    <div className="flex shrink-0 flex-col gap-1 border-b border-line bg-[rgba(255,255,255,0.03)] px-3 py-1.5">
      <div className="flex items-center gap-2 text-[11.5px]">
        {running ? (
          <Loader2 size={12} className="animate-spin-slow text-accent" />
        ) : failed.length > 0 ? (
          <X size={12} className="text-conflict" />
        ) : (
          <Check size={12} className="text-clean" />
        )}

        <span className="text-ink-soft">
          {opLabel(bulk.op)} {bulk.done}/{bulk.total}
        </span>

        {failed.length > 0 && (
          <span className="text-conflict">
            {failed.length} failed
          </span>
        )}

        {/* A thin bar reads faster than the numbers alone. */}
        <span className="ml-1 h-1 w-24 overflow-hidden rounded-full bg-[rgba(255,255,255,0.08)]">
          <span
            className="block h-full bg-accent transition-[width] duration-200"
            style={{ width: `${(bulk.done / bulk.total) * 100}%` }}
          />
        </span>

        {!running && (
          <button
            onClick={dismiss}
            className="ml-auto rounded px-1.5 py-0.5 text-ink-faint hover:bg-surface-hover hover:text-ink"
          >
            Dismiss
          </button>
        )}
      </div>

      {failed.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-5 text-[11px] text-ink-faint">
          {failed.map((r) => (
            // git errors run to paragraphs; one line here, the whole thing in
            // the tooltip and the log drawer.
            <span key={r.path} title={r.error} className="flex min-w-0 max-w-[380px] gap-1">
              <span className="shrink-0 text-conflict">{r.name}</span>
              <span className="truncate">— {r.error}</span>
            </span>
          ))}
          <button
            onClick={openLog}
            className="shrink-0 rounded px-1.5 py-0.5 text-ink-faint hover:bg-surface-hover hover:text-ink"
          >
            Details
          </button>
        </div>
      )}
    </div>
  )
}
