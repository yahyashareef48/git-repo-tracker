import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type MenuItem =
  | { kind: 'separator' }
  | {
      kind?: 'item'
      label: string
      icon?: React.ReactNode
      danger?: boolean
      disabled?: boolean
      /** Shown as a tooltip; use it to say why a disabled item is disabled. */
      title?: string
      onSelect: () => void
    }

type Pos = { top: number; left: number; maxHeight: number }

/**
 * A dropdown rendered into a portal with fixed positioning.
 *
 * Positioning matters more than it looks: an absolutely-positioned menu inside
 * the scrolling repo list extends that list's scroll area, so opening a menu on
 * the last row used to grow the page. Fixed coordinates keep the menu out of
 * layout entirely, and it flips above the trigger when the space below is tight.
 */
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
  const [pos, setPos] = useState<Pos | null>(null)
  const anchor = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !anchor.current) return

    const rect = anchor.current.getBoundingClientRect()
    const gap = 4
    const margin = 8
    const width = 200
    const wanted = panel.current?.offsetHeight ?? Math.min(items.length * 30 + 8, 320)

    const spaceBelow = window.innerHeight - rect.bottom - gap - margin
    const spaceAbove = rect.top - gap - margin
    const above = spaceBelow < wanted && spaceAbove > spaceBelow

    setPos({
      top: above ? Math.max(margin, rect.top - gap - Math.min(wanted, spaceAbove)) : rect.bottom + gap,
      left:
        align === 'right'
          ? Math.max(margin, Math.min(rect.right - width, window.innerWidth - width - margin))
          : Math.max(margin, rect.left),
      maxHeight: Math.max(120, above ? spaceAbove : spaceBelow),
    })
  }, [open, items.length, align])

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (anchor.current?.contains(t) || panel.current?.contains(t)) return
      close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    // Scrolling the list would leave the menu floating next to nothing.
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  return (
    <div className="relative" ref={anchor}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open &&
        createPortal(
          <div
            ref={panel}
            style={{
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              maxHeight: pos?.maxHeight,
            }}
            className="animate-fade-in fixed z-50 w-[200px] overflow-y-auto rounded-lg border border-line-strong bg-surface-raised p-1 shadow-xl backdrop-blur-xl"
          >
            {items.map((item, i) =>
              item.kind === 'separator' ? (
                <div key={i} className="my-1 h-px bg-line" />
              ) : (
                <button
                  key={i}
                  disabled={item.disabled}
                  title={item.title}
                  onClick={() => {
                    setOpen(false)
                    item.onSelect()
                  }}
                  className={
                    'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[12px] leading-5 transition-colors ' +
                    (item.disabled
                      ? 'cursor-not-allowed text-ink-faint line-through decoration-ink-faint/40'
                      : item.danger
                        ? 'text-conflict hover:bg-[rgba(242,96,122,0.12)]'
                        : 'text-ink-soft hover:bg-surface-hover hover:text-ink')
                  }
                >
                  <span className="grid w-4 shrink-0 place-items-center">{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}
