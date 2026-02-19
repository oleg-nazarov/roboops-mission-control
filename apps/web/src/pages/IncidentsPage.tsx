import { useMemo } from 'react'
import { useReplayRunsQuery } from '../queries/replay'

const formatTs = (ts: number): string =>
  new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

export function IncidentsPage() {
  const runsQuery = useReplayRunsQuery()

  const content = useMemo(() => {
    if (runsQuery.isLoading) {
      return <p className="text-sm text-muted">Loading replay runs...</p>
    }

    if (runsQuery.isError) {
      return <p className="text-sm text-status-fault">Failed to load replay run history.</p>
    }

    const runs = runsQuery.data ?? []
    if (runs.length === 0) {
      return <p className="text-sm text-muted">No replay runs available yet.</p>
    }

    return (
      <div className="mt-4 space-y-3">
        {runs.map((run) => (
          <article
            className="rounded-panel border border-border/60 bg-surface-elevated/55 p-3"
            key={run.runId}
          >
            <p className="font-mono text-xs text-muted">{run.runId}</p>
            <p className="mt-1 text-sm text-muted">
              {formatTs(run.startedAtTs)} - {formatTs(run.endedAtTs)}
            </p>
            <p className="mt-1 text-sm text-muted">Mode: {run.mode}</p>
            <p className="mt-1 text-sm text-muted">Incidents: {run.incidents.join(', ')}</p>
          </article>
        ))}
      </div>
    )
  }, [runsQuery.data, runsQuery.isError, runsQuery.isLoading])

  return (
    <section className="panel animate-shell-in p-5 [animation-delay:80ms]">
      <p className="text-xs uppercase tracking-[0.18em] text-muted">Incidents</p>
      <h2 className="mt-2 font-display text-lg font-semibold">Incidents list placeholder</h2>
      <p className="mt-3 max-w-3xl text-sm text-muted">
        This page will list incidents with filters by type, severity, and robot, plus Replay actions.
      </p>
      {content}
    </section>
  )
}
