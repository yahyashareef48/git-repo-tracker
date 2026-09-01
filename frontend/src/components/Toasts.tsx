import { CircleCheck, CircleX, Info, X } from 'lucide-react'
import { useRepos } from '../store/repos'

const styles = {
  success: { icon: CircleCheck, cls: 'text-clean' },
  error: { icon: CircleX, cls: 'text-conflict' },
  info: { icon: Info, cls: 'text-accent' },
} as const

export function Toasts() {
  const toasts = useRepos((s) => s.toasts)
  const dismiss = useRepos((s) => s.dismissToast)

  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => {
        const { icon: Icon, cls } = styles[t.kind]
        return (
          <div
            key={t.id}
            className="animate-fade-in pointer-events-auto flex max-w-[380px] items-start gap-2.5 rounded-lg border border-line-strong bg-surface-raised px-3 py-2.5 shadow-xl backdrop-blur-xl"
          >
            <Icon size={14} className={'mt-[1px] shrink-0 ' + cls} />
            <div className="min-w-0 flex-1">
              <div className="selectable text-[12.5px] leading-snug text-ink-soft">{t.text}</div>
              {t.detail && (
                <div className="selectable mt-1 font-mono text-[11px] leading-snug text-ink-faint">
                  {t.detail}
                </div>
              )}
              {t.actions && t.actions.length > 0 && (
                <div className="mt-2 flex gap-1.5">
                  {t.actions.map((a) => (
                    <button
                      key={a.label}
                      onClick={() => {
                        dismiss(t.id)
                        a.run()
                      }}
                      className="rounded border border-line-strong px-2 py-1 text-[11.5px] text-ink-soft transition-colors hover:bg-surface-hover hover:text-ink"
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="mt-[1px] shrink-0 text-ink-faint hover:text-ink"
            >
              <X size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
