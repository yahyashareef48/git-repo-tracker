import { CloudOff, Loader2, RefreshCw, TriangleAlert } from 'lucide-react'
import { useRepos, type Health } from '../store/repos'

const dots: Record<Health['state'], string> = {
  connected: 'bg-clean',
  degraded: 'bg-behind',
  offline: 'bg-conflict',
  noauth: 'bg-conflict',
  nocli: 'bg-behind',
}

const labels: Record<Health['state'], string> = {
  connected: 'GitHub',
  degraded: 'Degraded',
  offline: 'Offline',
  noauth: 'Not signed in',
  nocli: 'No gh CLI',
}

/** The always-visible dot in the title bar. */
export function GitHubStatusPill() {
  const health = useRepos((s) => s.health)
  const checking = useRepos((s) => s.healthChecking)
  const check = useRepos((s) => s.checkHealth)

  if (!health) {
    return (
      <span className="flex items-center gap-1.5 text-[11.5px] text-ink-faint">
        <Loader2 size={11} className="animate-spin-slow" />
        checking GitHub
      </span>
    )
  }

  return (
    <button
      onClick={check}
      title={`${health.message}\nLast checked ${health.checkedAt} — click to re-check`}
      className="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11.5px] text-ink-faint transition-colors hover:bg-surface-hover hover:text-ink"
    >
      {checking ? (
        <Loader2 size={10} className="animate-spin-slow" />
      ) : (
        <span className={'h-1.5 w-1.5 rounded-full ' + dots[health.state]} />
      )}
      {health.state === 'connected' ? health.account : labels[health.state]}
    </button>
  )
}

/**
 * The banner shown whenever remote git is at risk. It never hides the cause and
 * never offers to handle credentials itself — signing in is something the user
 * does in their own terminal.
 */
export function ConnectivityBanner() {
  const health = useRepos((s) => s.health)
  const checking = useRepos((s) => s.healthChecking)
  const check = useRepos((s) => s.checkHealth)
  const copyAuth = useRepos((s) => s.copyAuthCommand)
  const toggleLog = useRepos((s) => s.toggleLog)

  if (!health || health.state === 'connected') return null

  const severe = health.state === 'offline' || health.state === 'noauth'
  const Icon = health.state === 'offline' ? CloudOff : TriangleAlert

  return (
    <div
      className={
        'flex shrink-0 items-center gap-2 border-b border-line px-3 py-2 text-[12px] ' +
        (severe ? 'bg-[rgba(242,96,122,0.10)]' : 'bg-[rgba(240,184,73,0.10)]')
      }
    >
      <Icon size={14} className={'shrink-0 ' + (severe ? 'text-conflict' : 'text-behind')} />
      <span className="min-w-0 flex-1 text-ink-soft">{health.message}</span>

      {health.state === 'noauth' && (
        <BannerButton onClick={copyAuth}>Copy `gh auth login`</BannerButton>
      )}
      {health.detail && <BannerButton onClick={toggleLog}>Details</BannerButton>}
      <BannerButton onClick={check}>
        <RefreshCw size={11} className={checking ? 'animate-spin-slow' : ''} />
        Retry
      </BannerButton>
    </div>
  )
}

function BannerButton({
  children,
  onClick,
}: {
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex shrink-0 items-center gap-1 rounded border border-line-strong px-2 py-0.5 text-[11.5px] text-ink-soft transition-colors hover:bg-surface-hover hover:text-ink"
    >
      {children}
    </button>
  )
}
