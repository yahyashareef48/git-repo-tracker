import { useMemo } from 'react'
import { FileQuestion, Loader2, Scissors } from 'lucide-react'
import type { gitx } from '../../wailsjs/go/models'
import { parseDiff } from '../lib/diff'

/**
 * A unified diff, rendered as a fixed grid of line numbers plus text.
 *
 * This is deliberately not Monaco: the editor would add several megabytes to a
 * 12 MB app for a read-only view, and a coloured unified diff is what `git
 * diff` shows anyway. Long lines scroll horizontally inside the pane rather
 * than wrapping, so columns stay aligned.
 */
export function DiffView({
  diff,
  loading,
}: {
  diff: gitx.Diff | null
  loading: boolean
}) {
  const parsed = useMemo(() => parseDiff(diff?.text ?? ''), [diff?.text])

  if (loading) {
    return (
      <Centered>
        <Loader2 size={16} className="animate-spin-slow" />
        Loading diff…
      </Centered>
    )
  }
  if (!diff) {
    return (
      <Centered>
        <FileQuestion size={16} />
        Select a file to see its changes.
      </Centered>
    )
  }
  if (diff.error) {
    return <Centered className="text-conflict">{diff.error}</Centered>
  }
  if (diff.binary) {
    return <Centered>Binary file — no text diff to show.</Centered>
  }
  if (parsed.hunks.length === 0) {
    return <Centered>No textual changes in this file.</Centered>
  }

  return (
    <div className="h-full overflow-auto font-mono text-[11.5px] leading-[1.55]">
      {parsed.hunks.map((hunk, hi) => (
        <div key={hi}>
          <div className="sticky top-0 z-10 border-y border-line bg-surface-solid px-3 py-0.5 text-[11px] text-ink-faint">
            {hunk.header}
          </div>
          {hunk.lines.map((line, li) => (
            <div
              key={li}
              className={
                'flex whitespace-pre ' +
                (line.type === 'add'
                  ? 'bg-[rgba(95,209,160,0.10)]'
                  : line.type === 'del'
                    ? 'bg-[rgba(242,96,122,0.10)]'
                    : line.type === 'meta'
                      ? 'text-ink-faint'
                      : '')
              }
            >
              <span className="sticky left-0 w-10 shrink-0 select-none bg-surface-solid pr-2 text-right text-ink-faint/70">
                {line.oldNo ?? ''}
              </span>
              <span className="sticky left-10 w-10 shrink-0 select-none bg-surface-solid pr-2 text-right text-ink-faint/70">
                {line.newNo ?? ''}
              </span>
              <span
                className={
                  'w-4 shrink-0 select-none text-center ' +
                  (line.type === 'add'
                    ? 'text-clean'
                    : line.type === 'del'
                      ? 'text-conflict'
                      : 'text-transparent')
                }
              >
                {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}
              </span>
              <span className="selectable pr-4 text-ink-soft">{line.text || ' '}</span>
            </div>
          ))}
        </div>
      ))}

      {diff.truncated && (
        <div className="flex items-center gap-2 border-t border-line px-3 py-2 text-[11.5px] text-behind">
          <Scissors size={12} />
          Diff truncated — this file is too large to show in full.
        </div>
      )}
    </div>
  )
}

function Centered({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={
        'flex h-full items-center justify-center gap-2 px-6 text-center text-[12.5px] text-ink-faint ' +
        className
      }
    >
      {children}
    </div>
  )
}
