import { useEffect, useRef, useState } from 'react'

export type MenuItem =
  | { kind: 'separator' }
  | {
      kind?: 'item'
      label: string
      icon?: React.ReactNode
      danger?: boolean
      onSelect: () => void
    }

/** A small dropdown anchored to its trigger. Closes on outside click or Esc. */
export function Menu({
  trigger,
  items,
  align = 'right',
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode
  items: MenuItem[]
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div
          className={
            'animate-fade-in absolute top-[calc(100%+4px)] z-50 min-w-[180px] rounded-lg border border-line-strong bg-surface-raised p-1 shadow-xl backdrop-blur-xl ' +
            (align === 'right' ? 'right-0' : 'left-0')
          }
        >
          {items.map((item, i) =>
            item.kind === 'separator' ? (
              <div key={i} className="my-1 h-px bg-line" />
            ) : (
              <button
                key={i}
                onClick={() => {
                  setOpen(false)
                  item.onSelect()
                }}
                className={
                  'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[12.5px] transition-colors ' +
                  (item.danger
                    ? 'text-conflict hover:bg-[rgba(242,96,122,0.12)]'
                    : 'text-ink-soft hover:bg-surface-hover hover:text-ink')
                }
              >
                {item.icon}
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}
