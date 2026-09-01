import { useEffect, useRef } from 'react'
import { Check, ChevronDown, Trash2, X } from 'lucide-react'
import { useRepos } from '../store/repos'

/**
 * Every git command the session has run, with its real output. Nothing here is
 * paraphrased: if a push failed, the user sees git's own words.
 */
export function LogDrawer() {
  const open = useRepos((s) => s.logOpen)
  const log = useRepos((s) => s.log)
  const toggle = useRepos((s) => s.toggleLog)
  const clear = useRepos((s) => s.clearLog)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) bottom.current?.scrollIntoView({ block: 'end' })
  }, [open, log.length])

  if (!open) return null

  return (
    <div className="animate-fade-in flex h-[240px] shrink-0 flex-col border-t border-line-strong bg-[rgba(0,0,0,0.25)]">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-1.5">
        <ChevronDown size={13} className="text-ink-faint" />
        <span className="text-[12px] font-medium">Git output</span>
        <span className="text-[11px] text-ink-faint">{log.length} command(s)</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={clear}
            title="Clear"
            className="grid h-6 w-6 place-items-center rounded text-ink-faint hover:bg-surface-hover hover:text-ink"
          >
            <Trash2 size={12} />
          </button>
          <button
            onClick={toggle}
            title="Close"
            className="grid h-6 w-6 place-items-center rounded text-ink-faint hover:bg-surface-hover hover:text-ink"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 font-mono text-[11.5px] leading-relaxed">
        {log.length === 0 ? (
          <div className="py-8 text-center font-sans text-ink-faint">
            Nothing has run yet. Fetch, pull or push a repository and its output appears here.
          </div>
        ) : (
          log.map((e, i) => (
            <div key={i} className="selectable mb-2">
              <div className="flex items-center gap-2">
                {e.ok ? (
                  <Check size={11} className="shrink-0 text-clean" />
                ) : (
                  <X size={11} className="shrink-0 text-conflict" />
                )}
                <span className="text-ink-faint">{e.at}</span>
                <span className="text-accent">{e.repoName}</span>
                <span className="truncate text-ink-soft">{e.command || e.op}</span>
              </div>
              {e.stdout && (
                <pre className="ml-[19px] whitespace-pre-wrap text-ink-faint">{e.stdout}</pre>
              )}
              {e.stderr && (
                <pre
                  className={
                    'ml-[19px] whitespace-pre-wrap ' + (e.ok ? 'text-ink-faint' : 'text-conflict')
                  }
                >
                  {e.stderr}
                </pre>
              )}
            </div>
          ))
        )}
        <div ref={bottom} />
      </div>
    </div>
  )
}
