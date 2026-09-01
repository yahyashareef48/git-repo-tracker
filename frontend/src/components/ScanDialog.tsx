import { Check, FolderSearch, Loader2, X } from 'lucide-react'
import { useRepos } from '../store/repos'

export function ScanDialog() {
  const scan = useRepos((s) => s.scan)
  const toggle = useRepos((s) => s.toggleScanPick)
  const setAll = useRepos((s) => s.setAllScanPicks)
  const confirm = useRepos((s) => s.confirmScan)
  const cancel = useRepos((s) => s.cancelScan)

  if (!scan) return null

  const newOnes = scan.results.filter((r) => !r.tracked)
  const allPicked = newOnes.length > 0 && scan.selected.size === newOnes.length

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-8 backdrop-blur-sm"
      onClick={cancel}
    >
      <div
        className="animate-fade-in flex max-h-full w-full max-w-[620px] flex-col overflow-hidden rounded-xl border border-line-strong bg-surface-raised shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          <FolderSearch size={15} className="text-accent" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold">Repositories found</div>
            <div className="truncate font-mono text-[11px] text-ink-faint">{scan.root}</div>
          </div>
          <button
            onClick={cancel}
            aria-label="Close"
            className="grid h-7 w-7 place-items-center rounded text-ink-faint hover:bg-surface-hover hover:text-ink"
          >
            <X size={14} />
          </button>
        </div>

        {scan.scanning ? (
          <div className="flex items-center justify-center gap-2.5 px-4 py-14 text-ink-soft">
            <Loader2 size={16} className="animate-spin-slow" />
            <span className="text-[12.5px]">Scanning folders…</span>
          </div>
        ) : scan.results.length === 0 ? (
          <div className="px-4 py-14 text-center text-[12.5px] text-ink-faint">
            No git repositories found under this folder.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-line px-4 py-2 text-[11.5px] text-ink-faint">
              <span>
                {scan.results.length} found · {scan.results.length - newOnes.length} already tracked
              </span>
              {newOnes.length > 0 && (
                <button
                  onClick={() => setAll(!allPicked)}
                  className="rounded px-2 py-1 text-accent hover:bg-surface-hover"
                >
                  {allPicked ? 'Deselect all' : 'Select all new'}
                </button>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {scan.results.map((r) => {
                const picked = scan.selected.has(r.path)
                return (
                  <button
                    key={r.path}
                    disabled={r.tracked}
                    onClick={() => toggle(r.path)}
                    className={
                      'flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ' +
                      (r.tracked
                        ? 'cursor-default opacity-45'
                        : 'hover:bg-surface-hover')
                    }
                  >
                    <span
                      className={
                        'grid h-4 w-4 shrink-0 place-items-center rounded border ' +
                        (picked
                          ? 'border-accent bg-accent text-[#0b0e14]'
                          : 'border-line-strong')
                      }
                    >
                      {picked && <Check size={11} strokeWidth={3} />}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px]">{r.name}</div>
                      <div className="truncate font-mono text-[11px] text-ink-faint">{r.path}</div>
                    </div>

                    {r.branch && (
                      <span className="shrink-0 font-mono text-[11px] text-ink-faint">
                        {r.branch}
                      </span>
                    )}
                    {r.tracked && (
                      <span className="shrink-0 text-[11px] text-ink-faint">tracked</span>
                    )}
                  </button>
                )
              })}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
              <button
                onClick={cancel}
                className="rounded-md px-3 py-1.5 text-[12.5px] text-ink-soft hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                onClick={confirm}
                disabled={scan.selected.size === 0}
                className="rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-medium text-[#0b0e14] transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Add {scan.selected.size > 0 ? scan.selected.size : ''} repositor
                {scan.selected.size === 1 ? 'y' : 'ies'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
