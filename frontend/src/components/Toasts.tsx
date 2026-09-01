import { CircleCheck, CircleX, Info, Terminal, X } from 'lucide-react'
import { useRepos } from '../store/repos'

const styles = {
  success: { icon: CircleCheck, cls: 'text-clean' },
  error: { icon: CircleX, cls: 'text-conflict' },
  info: { icon: Info, cls: 'text-accent' },
} as const

/** Only the newest few are shown; a bulk operation must not wallpaper the app. */
const MAX_VISIBLE = 3

export function Toasts() {
  const toasts = useRepos((s) => s.toasts)
  const dismiss = useRepos((s) => s.dismissToast)
  const toggleLog = useRepos((s) => s.toggleLog)
  const logOpen = useRepos((s) => s.logOpen)

  if (toasts.length === 0) return null

  const hidden = Math.max(0, toasts.length - MAX_VISIBLE)
  const visible = toasts.slice(-MAX_VISIBLE)

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-40 flex w-[320px] flex-col items-end gap-1.5">
      {hidden > 0 && (
        <div className="pointer-events-auto rounded bg-surface-raised px-2 py-0.5 text-[11px] text-ink-faint">
          +{hidden} more
        </div>
      )}

      {visible.map((t) => {
        const { icon: Icon, cls } = styles[t.kind]
        return (
          <div
            key={t.id}
            className="animate-slide-in pointer-events-auto flex w-full items-start gap-2 rounded-lg border border-line-strong bg-surface-raised px-2.5 py-2 shadow-xl backdrop-blur-xl"
          >
            <Icon size={13} className={'mt-[2px] shrink-0 ' + cls} />

            <div className="min-w-0 flex-1">
              {/* Git errors can be paragraphs. Two lines here, the whole thing
                  in the log drawer. */}
              <div
                title={t.text}
                className="selectable line-clamp-2 text-[12px] leading-snug text-ink-soft"
              >
                {t.text}
              </div>
              {t.detail && (
                <div
                  title={t.detail}
                  className="selectable mt-0.5 line-clamp-2 text-[11px] leading-snug text-ink-faint"
                >
                  {t.detail}
                </div>
              )}

              {(t.actions?.length || t.kind === 'error') && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {t.actions?.map((a) => (
                    <button
                      key={a.label}
                      onClick={() => {
                        dismiss(t.id)
                        a.run()
                      }}
                      className="rounded border border-line-strong px-1.5 py-0.5 text-[11px] text-ink-soft transition-colors hover:bg-surface-hover hover:text-ink"
                    >
                      {a.label}
                    </button>
                  ))}
                  {t.kind === 'error' && !logOpen && (
                    <button
                      onClick={() => {
                        dismiss(t.id)
                        toggleLog()
                      }}
                      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-ink-faint hover:text-ink"
                    >
                      <Terminal size={10} />
                      Details
                    </button>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="mt-[2px] shrink-0 text-ink-faint hover:text-ink"
            >
              <X size={11} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
