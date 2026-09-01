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
            <span className="selectable flex-1 text-[12.5px] leading-snug text-ink-soft">
              {t.text}
            </span>
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
