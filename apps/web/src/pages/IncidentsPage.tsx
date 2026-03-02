import { useMemo, useState } from 'react'
import type { IncidentType, Severity } from '@roboops/contracts'
import { Link } from 'react-router-dom'
import { useAppStore } from '../state/appStore'

const formatTs = (ts: number): string =>
  new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

const incidentTypeOptions: IncidentType[] = [
  'LOCALIZATION_DROPOUT',
  'OBSTACLE_BLOCKED',
  'STUCK',
  'SENSOR_FAIL',
  'GEOFENCE_VIOLATION',
]

const severityOptions: Severity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

const severityBadgeClassName: Record<Severity, string> = {
  LOW: 'bg-status-on-mission/20 text-status-on-mission',
  MEDIUM: 'bg-status-idle/20 text-status-idle',
  HIGH: 'bg-status-need-assist/20 text-status-need-assist',
  CRITICAL: 'bg-status-fault/20 text-status-fault',
}

export function IncidentsPage() {
  const recentIncidents = useAppStore((state) => state.stream.recentIncidents)
  const [typeFilter, setTypeFilter] = useState<IncidentType | 'ALL'>('ALL')
  const [severityFilter, setSeverityFilter] = useState<Severity | 'ALL'>('ALL')
  const [robotFilter, setRobotFilter] = useState<string>('ALL')

  const allIncidents = useMemo(() => {
    const byId = new Map<string, (typeof recentIncidents)[number]>()

    for (const incident of recentIncidents) {
      byId.set(incident.incidentId, incident)
    }

    return [...byId.values()].sort((left, right) => right.ts - left.ts)
  }, [recentIncidents])

  const robotOptions = useMemo(
    () => [...new Set(allIncidents.map((incident) => incident.robotId))].sort((a, b) => a.localeCompare(b)),
    [allIncidents],
  )

  const filteredIncidents = useMemo(
    () =>
      allIncidents.filter((incident) => {
        const matchesType = typeFilter === 'ALL' || incident.incidentType === typeFilter
        const matchesSeverity = severityFilter === 'ALL' || incident.severity === severityFilter
        const matchesRobot = robotFilter === 'ALL' || incident.robotId === robotFilter

        return matchesType && matchesSeverity && matchesRobot
      }),
    [allIncidents, robotFilter, severityFilter, typeFilter],
  )

  const resetFilters = (): void => {
    setTypeFilter('ALL')
    setSeverityFilter('ALL')
    setRobotFilter('ALL')
  }

  return (
    <section className="panel animate-shell-in p-5 [animation-delay:80ms]">
      <p className="text-xs uppercase tracking-[0.18em] text-muted">Incidents</p>
      <h2 className="mt-2 font-display text-lg font-semibold">Incident Queue</h2>
      <p className="mt-3 max-w-3xl text-sm text-muted">Filter by type, severity, and robot, then jump directly into replay.</p>

      <div className="mt-5 grid gap-4 rounded-panel border border-border/60 bg-surface-elevated/55 p-4 md:grid-cols-[1fr_1fr_1fr_auto]">
        <label className="block">
          <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-muted">Type</span>
          <select
            className="w-full rounded-panel border border-border/70 bg-surface px-3 py-2 text-sm outline-none transition focus:border-accent/60"
            onChange={(event) => setTypeFilter(event.target.value as IncidentType | 'ALL')}
            value={typeFilter}
          >
            <option value="ALL">All types</option>
            {incidentTypeOptions.map((typeOption) => (
              <option key={typeOption} value={typeOption}>
                {typeOption}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-muted">Severity</span>
          <select
            className="w-full rounded-panel border border-border/70 bg-surface px-3 py-2 text-sm outline-none transition focus:border-accent/60"
            onChange={(event) => setSeverityFilter(event.target.value as Severity | 'ALL')}
            value={severityFilter}
          >
            <option value="ALL">All severity</option>
            {severityOptions.map((severityOption) => (
              <option key={severityOption} value={severityOption}>
                {severityOption}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-muted">Robot</span>
          <select
            className="w-full rounded-panel border border-border/70 bg-surface px-3 py-2 text-sm outline-none transition focus:border-accent/60"
            onChange={(event) => setRobotFilter(event.target.value)}
            value={robotFilter}
          >
            <option value="ALL">All robots</option>
            {robotOptions.map((robotId) => (
              <option key={robotId} value={robotId}>
                {robotId}
              </option>
            ))}
          </select>
        </label>

        <button
          className="self-end rounded-pill border border-border/70 bg-surface px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition hover:border-accent/45"
          onClick={resetFilters}
          type="button"
        >
          Clear filters
        </button>
      </div>

      <div className="mt-5 overflow-x-auto rounded-panel border border-border/60 bg-surface-elevated/50">
        <table className="min-w-[1020px] w-full text-sm">
          <thead className="border-b border-border/70 bg-surface/80">
            <tr>
              <th className="px-3 py-2.5 text-left font-semibold text-muted">Incident</th>
              <th className="px-3 py-2.5 text-left font-semibold text-muted">Type</th>
              <th className="px-3 py-2.5 text-left font-semibold text-muted">Severity</th>
              <th className="px-3 py-2.5 text-left font-semibold text-muted">Timestamp</th>
              <th className="px-3 py-2.5 text-left font-semibold text-muted">Robot ID</th>
              <th className="px-3 py-2.5 text-left font-semibold text-muted">Mission ID</th>
              <th className="px-3 py-2.5 text-left font-semibold text-muted">Replay</th>
            </tr>
          </thead>
          <tbody>
            {filteredIncidents.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-muted" colSpan={7}>
                  No incidents match current filters.
                </td>
              </tr>
            ) : (
              filteredIncidents.map((incident) => (
                <tr className="h-[56px] border-b border-border/40" key={incident.incidentId}>
                  <td className="px-3 py-2.5 font-mono text-xs">{incident.incidentId}</td>
                  <td className="px-3 py-2.5">{incident.incidentType}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={[
                        'inline-flex rounded-pill px-2.5 py-1 text-xs font-semibold',
                        severityBadgeClassName[incident.severity],
                      ].join(' ')}
                    >
                      {incident.severity}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">{formatTs(incident.ts)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{incident.robotId}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{incident.missionId ?? 'n/a'}</td>
                  <td className="px-3 py-2.5">
                    <Link
                      className="inline-flex cursor-pointer rounded-pill border border-border/70 bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition hover:border-accent/50"
                      to={`/incidents/${incident.incidentId}/replay`}
                    >
                      Replay
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
