import { useEffect, useRef, useState } from 'react'
import { FolderTree, X } from 'lucide-react'
import { useRepos } from '../store/repos'

/**
 * Assigns one or more repos to a group. Groups are free text with no separate
 * lifecycle: a group exists exactly as long as some repo names it, so there is
 * nothing to create or delete — typing a new name here is how one is made.
 */
export function GroupDialog() {
  const targets = useRepos((s) => s.groupTargets)
  const groups = useRepos((s) => s.groups)
  const repos = useRepos((s) => s.repos)
  const close = useRepos((s) => s.closeGroupDialog)
  const setGroup = useRepos((s) => s.setGroup)

  const open = targets.length > 0
  const picked = repos.filter((r) => targets.includes(r.path))
  // Pre-fill only when every selected repo already agrees on a group.
  const shared = picked.length > 0 && picked.every((r) => r.group === picked[0].group)
  const current = shared ? (picked[0].group ?? '') : ''

  const [value, setValue] = useState('')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setValue(current)
    // A dialog you must click into before typing is a dialog that wastes time.
    setTimeout(() => input.current?.select(), 0)
  }, [open, current])

  if (!open) return null

  const submit = () => setGroup(targets, value.trim())
  const subject =
    picked.length === 1
      ? (picked[0]?.name ?? targets[0])
      : `${targets.length} repositories`

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-8 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="animate-fade-in w-full max-w-[380px] overflow-hidden rounded-xl border border-line-strong bg-surface-raised shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          <FolderTree size={15} className="text-accent" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold">Move to group</div>
            <div className="truncate text-[11px] text-ink-faint">{subject}</div>
          </div>
          <button
            onClick={close}
            aria-label="Close"
            className="grid h-7 w-7 place-items-center rounded text-ink-faint hover:bg-surface-hover hover:text-ink"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-4 py-3">
          <input
            ref={input}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              if (e.key === 'Escape') close()
            }}
            placeholder="Type a new group name, e.g. perfai"
            className="selectable w-full rounded-md border border-line bg-[rgba(255,255,255,0.04)] px-2.5 py-1.5 text-[12.5px] text-ink outline-none placeholder:text-ink-faint focus:border-line-strong"
          />

          {groups.length > 0 && (
            <>
              <div className="mt-3 text-[11px] uppercase tracking-wide text-ink-faint">
                Existing groups
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {groups.map((g) => (
                  <button
                    key={g}
                    onClick={() => setValue(g)}
                    className={
                      'rounded-full border px-2 py-0.5 text-[11.5px] transition-colors ' +
                      (value === g
                        ? 'border-accent/50 bg-accent-dim text-accent'
                        : 'border-line text-ink-soft hover:border-line-strong hover:text-ink')
                    }
                  >
                    {g}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-line px-4 py-3">
          {picked.some((r) => r.group) && (
            <button
              onClick={() => setGroup(targets, '')}
              className="rounded-md px-2.5 py-1.5 text-[12.5px] text-ink-faint hover:bg-surface-hover hover:text-ink"
            >
              Ungroup
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button
              onClick={close}
              className="rounded-md px-3 py-1.5 text-[12.5px] text-ink-soft hover:bg-surface-hover"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={!value.trim()}
              className="rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-medium text-[#0b0e14] transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
