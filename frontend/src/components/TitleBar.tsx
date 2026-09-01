import { GitBranch, Minus, Square, X } from 'lucide-react'
import {
  Quit,
  WindowMinimise,
  WindowToggleMaximise,
} from '../../wailsjs/runtime/runtime'

/**
 * The window is frameless, so this bar is both the chrome and the drag region.
 * Anything clickable inside it must opt out with `no-drag`.
 */
export function TitleBar({ right }: { right?: React.ReactNode }) {
  return (
    <header className="drag flex h-10 shrink-0 items-center gap-3 border-b border-line px-3">
      <div className="flex items-center gap-2 pl-1">
        <GitBranch size={15} className="text-accent" />
        <span className="text-[13px] font-semibold tracking-tight">GitDeck</span>
      </div>

      <div className="no-drag ml-auto flex items-center gap-2">{right}</div>

      <div className="no-drag flex items-center">
        <WindowButton onClick={WindowMinimise} label="Minimise">
          <Minus size={14} />
        </WindowButton>
        <WindowButton onClick={WindowToggleMaximise} label="Maximise">
          <Square size={11} />
        </WindowButton>
        <WindowButton onClick={Quit} label="Close" danger>
          <X size={14} />
        </WindowButton>
      </div>
    </header>
  )
}

function WindowButton({
  children,
  onClick,
  label,
  danger,
}: {
  children: React.ReactNode
  onClick: () => void
  label: string
  danger?: boolean
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className={
        'grid h-10 w-11 place-items-center text-ink-soft transition-colors ' +
        (danger
          ? 'hover:bg-[#e81123] hover:text-white'
          : 'hover:bg-surface-hover hover:text-ink')
      }
    >
      {children}
    </button>
  )
}
