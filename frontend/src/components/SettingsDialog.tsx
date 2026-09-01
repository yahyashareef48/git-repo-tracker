import { Check, Settings as SettingsIcon, X } from 'lucide-react'
import { useRepos } from '../store/repos'

export function SettingsDialog() {
  const open = useRepos((s) => s.settingsOpen)
  const toggle = useRepos((s) => s.toggleSettings)
  const settings = useRepos((s) => s.settings)
  const save = useRepos((s) => s.saveSettings)
  const autostart = useRepos((s) => s.autostart)
  const setAutostart = useRepos((s) => s.setAutostart)
  const env = useRepos((s) => s.env)
  const health = useRepos((s) => s.health)

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-8 backdrop-blur-sm"
      onClick={toggle}
    >
      <div
        className="animate-fade-in w-full max-w-[460px] overflow-hidden rounded-xl border border-line-strong bg-surface-raised shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          <SettingsIcon size={15} className="text-accent" />
          <div className="flex-1 text-[13px] font-semibold">Settings</div>
          <button
            onClick={toggle}
            aria-label="Close"
            className="grid h-7 w-7 place-items-center rounded text-ink-faint hover:bg-surface-hover hover:text-ink"
          >
            <X size={14} />
          </button>
        </div>

        <div className="divide-y divide-line">
          <Toggle
            label="Start with Windows"
            hint="Adds a per-user startup entry. Launches straight into the tray."
            checked={autostart}
            onChange={setAutostart}
          />
          <Toggle
            label="Close to tray"
            hint="Closing the window keeps GitDeck running in the notification area."
            checked={settings?.closeToTray ?? true}
            onChange={(v) => save({ closeToTray: v })}
          />
          <Toggle
            label="Start minimised"
            hint="Open hidden in the tray instead of showing the window."
            checked={settings?.startMinimised ?? false}
            onChange={(v) => save({ startMinimised: v })}
          />
          <Toggle
            label="Fetch in the background"
            hint="Keeps ahead/behind counts honest without you asking."
            checked={settings?.autoFetchEnabled ?? true}
            onChange={(v) => save({ autoFetchEnabled: v })}
          />

          {settings?.autoFetchEnabled && (
            <Row label="Fetch every" hint="Skipped whenever GitHub is unreachable.">
              <select
                value={settings?.autoFetchMinutes ?? 5}
                onChange={(e) => save({ autoFetchMinutes: Number(e.target.value) })}
                className="rounded-md border border-line bg-surface-raised px-2 py-1 text-[12px] text-ink outline-none focus:border-line-strong"
              >
                {[5, 10, 15, 30, 60].map((m) => (
                  <option key={m} value={m}>
                    {m} minutes
                  </option>
                ))}
              </select>
            </Row>
          )}

          <Toggle
            label="Pull from main using rebase"
            hint="Off means merge, which is the default."
            checked={settings?.pullFromMainRebase ?? false}
            onChange={(v) => save({ pullFromMainRebase: v })}
          />
        </div>

        <div className="space-y-0.5 border-t border-line px-4 py-3 text-[11px] text-ink-faint">
          <div>
            git <span className="font-mono">{env?.gitVersion || 'not found'}</span>
            {health?.version && <> · <span className="font-mono">{health.version}</span></>}
          </div>
          {env?.storeFile && (
            <div className="selectable truncate font-mono" title={env.storeFile}>
              {env.storeFile}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] text-ink-soft">{label}</div>
        {hint && <div className="text-[11px] leading-snug text-ink-faint">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-hover"
    >
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] text-ink-soft">{label}</div>
        {hint && <div className="text-[11px] leading-snug text-ink-faint">{hint}</div>}
      </div>
      <span
        className={
          'grid h-4 w-4 shrink-0 place-items-center rounded border ' +
          (checked ? 'border-accent bg-accent text-[#0b0e14]' : 'border-line-strong')
        }
      >
        {checked && <Check size={11} strokeWidth={3} />}
      </span>
    </button>
  )
}
