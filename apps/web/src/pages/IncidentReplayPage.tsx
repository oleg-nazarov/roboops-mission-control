import { useParams } from 'react-router-dom'

export function IncidentReplayPage() {
  const { incidentId } = useParams()

  return (
    <section className="panel animate-shell-in p-5 [animation-delay:80ms]">
      <p className="text-xs uppercase tracking-[0.18em] text-muted">Replay</p>
      <h2 className="mt-2 font-display text-lg font-semibold">Incident Replay: {incidentId ?? 'unknown'}</h2>
      <p className="mt-3 max-w-3xl text-sm text-muted">
        This page will provide timeline scrubber, event markers, synchronized map replay, and metric
        panels over time.
      </p>
    </section>
  )
}
