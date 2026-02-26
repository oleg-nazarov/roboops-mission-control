import { useEffect, useMemo, useState } from 'react'
import type { RobotStatus } from '@roboops/contracts'
import { useNavigate } from 'react-router-dom'
import { useAppStore, type FleetStatusFilter } from '../state/appStore'

const statusOptions: FleetStatusFilter[] = ['FAULT', 'NEED_ASSIST', 'OFFLINE']
const statusSortRank: Record<RobotStatus, number> = {
  FAULT: 0,
  NEED_ASSIST: 1,
  OFFLINE: 2,
  ON_MISSION: 3,
  IDLE: 4,
}

type FleetSortKey =
  | 'robotId'
  | 'status'
  | 'battery'
  | 'temp'
  | 'heartbeat'
  | 'mission'
  | 'localization'
  | 'faults'
type SortDirection = 'asc' | 'desc'

const statusBadgeClassName: Record<RobotStatus, string> = {
  IDLE: 'bg-status-idle/20 text-status-idle',
  ON_MISSION: 'bg-status-on-mission/20 text-status-on-mission',
  NEED_ASSIST: 'bg-status-need-assist/20 text-status-need-assist',
  FAULT: 'bg-status-fault/20 text-status-fault',
  OFFLINE: 'bg-status-offline/20 text-status-offline',
}

const isFleetStatusFilter = (status: RobotStatus): status is FleetStatusFilter =>
  status === 'FAULT' || status === 'NEED_ASSIST' || status === 'OFFLINE'

export function FleetPage() {
  const navigate = useNavigate()
  const searchQuery = useAppStore((state) => state.fleetFilters.searchQuery)
  const statusFilters = useAppStore((state) => state.fleetFilters.statusFilters)
  const setFleetSearchQuery = useAppStore((state) => state.setFleetSearchQuery)
  const toggleFleetStatusFilter = useAppStore((state) => state.toggleFleetStatusFilter)
  const clearFleetStatusFilters = useAppStore((state) => state.clearFleetStatusFilters)
  const setSelectedRobotId = useAppStore((state) => state.setSelectedRobotId)
  const snapshot = useAppStore((state) => state.stream.snapshot)
  const heartbeat = useAppStore((state) => state.stream.heartbeat)
  const telemetryByRobot = useAppStore((state) => state.stream.telemetryByRobot)
  const recentEvents = useAppStore((state) => state.stream.recentEvents)
  const recentIncidents = useAppStore((state) => state.stream.recentIncidents)
  const wsStatus = useAppStore((state) => state.ws.status)
  const [sortKey, setSortKey] = useState<FleetSortKey>('robotId')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [nowTs, setNowTs] = useState(() => Date.now())

  const telemetryCount = Object.keys(telemetryByRobot).length
  const liveTick = heartbeat?.tick ?? snapshot?.tick
  const liveMode = heartbeat?.mode ?? snapshot?.mode
  const snapshotRobots = snapshot?.robots
  const snapshotRobotById = useMemo(
    () => new Map((snapshotRobots ?? []).map((robot) => [robot.robotId, robot])),
    [snapshotRobots],
  )

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTs(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [])

  const rows = useMemo(() => {
    const robotIds = new Set<string>([...snapshotRobotById.keys(), ...Object.keys(telemetryByRobot)])

    const mappedRows = [...robotIds].map((robotId) => {
      const snapshotRobot = snapshotRobotById.get(robotId)
      const telemetry = telemetryByRobot[robotId]

      const status: RobotStatus = telemetry?.status ?? snapshotRobot?.status ?? 'OFFLINE'
      const battery = telemetry?.battery ?? snapshotRobot?.battery ?? 0
      const temp = telemetry?.temp ?? snapshotRobot?.temp ?? 0
      const localizationConfidence =
        telemetry?.localizationConfidence ?? snapshotRobot?.localizationConfidence ?? 0
      const missionId = telemetry?.missionId ?? snapshotRobot?.missionId ?? null
      const missionProgress =
        missionId && snapshotRobot?.missionId === missionId ? snapshotRobot.missionProgress : null

      const lastHeartbeatTs =
        status === 'OFFLINE'
          ? snapshotRobot?.lastHeartbeatTs ?? telemetry?.ts ?? nowTs
          : telemetry?.ts ?? snapshotRobot?.lastHeartbeatTs ?? nowTs

      const lastHeartbeatSec = Math.max(0, Math.floor((nowTs - lastHeartbeatTs) / 1000))

      return {
        robotId,
        status,
        battery,
        temp,
        localizationConfidence,
        missionId,
        missionProgress,
        lastHeartbeatSec,
        faults24h: snapshotRobot?.faults24h ?? 0,
      }
    })

    const filteredRows = mappedRows.filter((row) => {
      const matchesSearch = row.robotId.toLowerCase().includes(searchQuery.trim().toLowerCase())
      const matchesStatus =
        statusFilters.length === 0 ||
        (isFleetStatusFilter(row.status) && statusFilters.includes(row.status))
      return matchesSearch && matchesStatus
    })

    return [...filteredRows].sort((left, right) => {
      if (sortKey === 'robotId') {
        const diff = left.robotId.localeCompare(right.robotId)
        return sortDirection === 'asc' ? diff : -diff
      }

      if (sortKey === 'status') {
        const diff = statusSortRank[left.status] - statusSortRank[right.status]
        return sortDirection === 'asc' ? diff : -diff
      }

      if (sortKey === 'battery') {
        const diff = left.battery - right.battery
        return sortDirection === 'asc' ? diff : -diff
      }

      if (sortKey === 'temp') {
        const diff = left.temp - right.temp
        return sortDirection === 'asc' ? diff : -diff
      }

      if (sortKey === 'mission') {
        const leftMission = left.missionId ?? 'ZZZ-NO-MISSION'
        const rightMission = right.missionId ?? 'ZZZ-NO-MISSION'
        const missionDiff = leftMission.localeCompare(rightMission)
        if (missionDiff !== 0) {
          return sortDirection === 'asc' ? missionDiff : -missionDiff
        }

        const progressDiff = (left.missionProgress ?? -1) - (right.missionProgress ?? -1)
        return sortDirection === 'asc' ? progressDiff : -progressDiff
      }

      if (sortKey === 'localization') {
        const diff = left.localizationConfidence - right.localizationConfidence
        return sortDirection === 'asc' ? diff : -diff
      }

      if (sortKey === 'faults') {
        const diff = left.faults24h - right.faults24h
        return sortDirection === 'asc' ? diff : -diff
      }

      const diff = left.lastHeartbeatSec - right.lastHeartbeatSec
      return sortDirection === 'asc' ? diff : -diff
    })
  }, [nowTs, searchQuery, snapshotRobotById, sortDirection, sortKey, statusFilters, telemetryByRobot])

  const toggleSort = (nextKey: FleetSortKey): void => {
    if (sortKey !== nextKey) {
      setSortKey(nextKey)
      setSortDirection('asc')
      return
    }

    setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
  }

  const openRobotDetail = (robotId: string): void => {
    setSelectedRobotId(robotId)
    navigate(`/robots/${robotId}`)
  }

  const renderSortHeaderButton = (column: FleetSortKey, label: string) => {
    const isActive = sortKey === column

    return (
      <button
        className="inline-flex cursor-pointer items-center gap-1 text-left hover:text-text"
        onClick={() => toggleSort(column)}
        type="button"
      >
        <span>{label}</span>
        <span className={['inline-block w-3 text-center', isActive ? 'opacity-100' : 'opacity-0'].join(' ')}>
          {sortDirection === 'asc' ? '^' : 'v'}
        </span>
      </button>
    )
  }

  return (
    <section className="panel animate-shell-in p-5 [animation-delay:80ms]">
      <p className="text-xs uppercase tracking-[0.18em] text-muted">Fleet Overview</p>
      <h2 className="mt-2 font-display text-lg font-semibold">Fleet table placeholder</h2>
      <p className="mt-3 max-w-3xl text-sm text-muted">
        This page will show robot status, battery, heartbeat, mission progress, localization
        confidence, and 24h fault counters.
      </p>

      <div className="mt-5 rounded-panel border border-border/60 bg-surface-elevated/55 p-4">
        <p className="text-xs uppercase tracking-[0.14em] text-muted">Live Stream</p>
        <p className="mt-2 text-sm text-muted">Connection: {wsStatus}</p>
        <p className="text-sm text-muted">Robots in telemetry cache: {telemetryCount}</p>
        <p className="text-sm text-muted">Recent events: {recentEvents.length}</p>
        <p className="text-sm text-muted">Recent incidents: {recentIncidents.length}</p>
        {liveTick !== undefined ? <p className="mt-2 text-sm text-muted">Live tick: {liveTick}</p> : null}
        {liveMode ? <p className="text-sm text-muted">Live mode: {liveMode}</p> : null}
        {snapshot ? (
          <p className="text-sm text-muted">Snapshot robots: {snapshot.robotCount}</p>
        ) : (
          <p className="mt-2 text-sm text-muted">Waiting for first snapshot...</p>
        )}
      </div>

      <div className="mt-5 grid gap-4 rounded-panel border border-border/60 bg-surface-elevated/55 p-4 md:grid-cols-[1fr_auto]">
        <label className="block">
          <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-muted">
            Search by robot id
          </span>
          <input
            className="w-full rounded-panel border border-border/70 bg-surface px-3 py-2 text-sm outline-none transition focus:border-accent/60"
            onChange={(event) => setFleetSearchQuery(event.target.value)}
            placeholder="RBT-001"
            type="text"
            value={searchQuery}
          />
        </label>

        <button
          className="self-end rounded-pill border border-border/70 bg-surface px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition hover:border-accent/45"
          onClick={clearFleetStatusFilters}
          type="button"
        >
          Clear Filters
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {statusOptions.map((status) => {
          const isActive = statusFilters.includes(status)
          return (
            <button
              className={[
                'rounded-pill border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition',
                isActive
                  ? 'border-accent/60 bg-accent-soft text-text'
                  : 'border-border/70 bg-surface text-muted hover:border-accent/40',
              ].join(' ')}
              key={status}
              onClick={() => toggleFleetStatusFilter(status)}
              type="button"
            >
              {status}
            </button>
          )
        })}
      </div>

      <div className="mt-5 overflow-x-auto rounded-panel border border-border/60 bg-surface-elevated/50">
        <table className="min-w-[980px] w-full text-sm">
          <thead className="border-b border-border/70 bg-surface/80">
            <tr>
              <th className="px-3 py-2.5 text-left font-semibold text-muted">
                {renderSortHeaderButton('robotId', 'Robot')}
              </th>
              <th className="px-3 py-2.5 text-left font-semibold text-muted">
                {renderSortHeaderButton('status', 'Status')}
              </th>
              <th className="px-3 py-2.5 text-left font-semibold text-muted">
                {renderSortHeaderButton('battery', 'Battery')}
              </th>
              <th className="px-3 py-2.5 text-left font-semibold text-muted">
                {renderSortHeaderButton('temp', 'Temp')}
              </th>
              <th className="px-3 py-2.5 text-left font-semibold text-muted">
                {renderSortHeaderButton('heartbeat', 'Last heartbeat')}
              </th>
              <th className="px-3 py-2.5 text-left font-semibold text-muted">
                {renderSortHeaderButton('mission', 'Mission')}
              </th>
              <th className="px-3 py-2.5 text-left font-semibold text-muted">
                {renderSortHeaderButton('localization', 'Localization')}
              </th>
              <th className="px-3 py-2.5 text-left font-semibold text-muted">
                {renderSortHeaderButton('faults', 'Faults (24h)')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-muted" colSpan={8}>
                  No robots match current filter criteria.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  className="h-[56px] cursor-pointer border-b border-border/40 transition hover:bg-surface-elevated/70"
                  key={row.robotId}
                  onClick={() => openRobotDetail(row.robotId)}
                >
                  <td className="px-3 py-2.5 font-mono text-xs">{row.robotId}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={[
                        'inline-flex rounded-pill px-2.5 py-1 text-xs font-semibold',
                        statusBadgeClassName[row.status],
                      ].join(' ')}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">{row.battery.toFixed(1)}%</td>
                  <td className="px-3 py-2.5">{row.temp.toFixed(1)} C</td>
                  <td className="px-3 py-2.5">{row.lastHeartbeatSec}s</td>
                  <td className="px-3 py-2.5">
                    <div className="min-h-8">
                      <p className="font-mono text-xs">{row.missionId ?? 'NO-MISSION'}</p>
                      <p className="text-xs text-muted">
                        {row.missionProgress !== null ? `${row.missionProgress.toFixed(1)}%` : 'n/a'}
                      </p>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">{row.localizationConfidence.toFixed(2)}</td>
                  <td className="px-3 py-2.5">{row.faults24h}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
