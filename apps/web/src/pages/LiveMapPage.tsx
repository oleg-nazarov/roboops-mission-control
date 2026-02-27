import { useMemo } from 'react'
import type { FleetRobotSnapshot, MissionType, RobotStatus, WarehouseZoneId } from '@roboops/contracts'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../state/appStore'
import { DeliveryMapCanvas } from './live-map/DeliveryMapCanvas'
import { WarehouseFloorplanCanvas } from './live-map/WarehouseFloorplanCanvas'
import type { LiveRobotMapData, MissionTargetMapData } from './live-map/types'

type RobotMapDetail = {
  robotId: string
  status: RobotStatus
  battery: number
  temp: number
  speed: number
  localizationConfidence: number
  missionId: string | null
  missionType: MissionType | null
  missionRouteLabel: string | null
  missionProgress: number | null
  faults24h: number
  pose: {
    x: number
    y: number
  }
}

const statusClassName: Record<RobotStatus, string> = {
  IDLE: 'bg-status-idle/20 text-status-idle',
  ON_MISSION: 'bg-status-on-mission/20 text-status-on-mission',
  NEED_ASSIST: 'bg-status-need-assist/20 text-status-need-assist',
  FAULT: 'bg-status-fault/20 text-status-fault',
  OFFLINE: 'bg-status-offline/20 text-status-offline',
}

const zoneLabel = (zoneId: WarehouseZoneId): string =>
  zoneId
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

const missionRouteLabel = (fromZoneId: WarehouseZoneId | null, toZoneId: WarehouseZoneId | null): string | null => {
  if (!fromZoneId || !toZoneId) {
    return null
  }

  return `${zoneLabel(fromZoneId)} -> ${zoneLabel(toZoneId)}`
}

export function LiveMapPage() {
  const navigate = useNavigate()
  const mode = useAppStore((state) => state.mode)
  const snapshot = useAppStore((state) => state.stream.snapshot)
  const telemetryByRobot = useAppStore((state) => state.stream.telemetryByRobot)
  const trailsByRobot = useAppStore((state) => state.stream.trailsByRobot)
  const selectedRobotId = useAppStore((state) => state.selectedRobotId)
  const setSelectedRobotId = useAppStore((state) => state.setSelectedRobotId)
  const operatorActionsByRobot = useAppStore((state) => state.operatorActions.byRobot)
  const requestOperatorAssistance = useAppStore((state) => state.requestOperatorAssistance)
  const toggleRobotMissionPause = useAppStore((state) => state.toggleRobotMissionPause)
  const createIncidentTicket = useAppStore((state) => state.createIncidentTicket)

  const missionByRobotId = useMemo(() => {
    const map = new Map<
      string,
      {
        missionId: string
        missionType: MissionType
        fromZoneId: WarehouseZoneId | null
        toZoneId: WarehouseZoneId | null
        progress: number
        target: { x: number; y: number }
      }
    >()

    for (const mission of snapshot?.missions ?? []) {
      map.set(mission.robotId, {
        missionId: mission.missionId,
        missionType: mission.missionType,
        fromZoneId: mission.fromZoneId ?? null,
        toZoneId: mission.toZoneId ?? null,
        progress: mission.progress,
        target: mission.target,
      })
    }
    return map
  }, [snapshot?.missions])

  const snapshotRobotById = useMemo(() => {
    const map = new Map<string, FleetRobotSnapshot>()
    for (const robot of snapshot?.robots ?? []) {
      map.set(robot.robotId, robot)
    }
    return map
  }, [snapshot?.robots])

  const robotDetails = useMemo<RobotMapDetail[]>(() => {
    const robotIds = new Set<string>([
      ...(snapshot?.robots.map((robot) => robot.robotId) ?? []),
      ...Object.keys(telemetryByRobot),
    ])

    return [...robotIds]
      .map((robotId) => {
        const snapshotRobot = snapshotRobotById.get(robotId)
        const telemetry = telemetryByRobot[robotId]
        const mission = missionByRobotId.get(robotId)

        const status: RobotStatus = telemetry?.status ?? snapshotRobot?.status ?? 'OFFLINE'

        return {
          robotId,
          status,
          battery: telemetry?.battery ?? snapshotRobot?.battery ?? 0,
          temp: telemetry?.temp ?? snapshotRobot?.temp ?? 0,
          speed: telemetry?.speed ?? snapshotRobot?.speed ?? 0,
          localizationConfidence:
            telemetry?.localizationConfidence ?? snapshotRobot?.localizationConfidence ?? 0,
          missionId: telemetry?.missionId ?? snapshotRobot?.missionId ?? mission?.missionId ?? null,
          missionType: mission?.missionType ?? null,
          missionRouteLabel: missionRouteLabel(mission?.fromZoneId ?? null, mission?.toZoneId ?? null),
          missionProgress: mission?.progress ?? snapshotRobot?.missionProgress ?? null,
          faults24h: snapshotRobot?.faults24h ?? 0,
          pose: {
            x: telemetry?.pose.x ?? snapshotRobot?.pose.x ?? 0,
            y: telemetry?.pose.y ?? snapshotRobot?.pose.y ?? 0,
          },
        }
      })
      .sort((left, right) => left.robotId.localeCompare(right.robotId))
  }, [missionByRobotId, snapshot?.robots, snapshotRobotById, telemetryByRobot])

  const mapRobots = useMemo<LiveRobotMapData[]>(
    () =>
      robotDetails.map((robot) => ({
        robotId: robot.robotId,
        status: robot.status,
        pose: robot.pose,
      })),
    [robotDetails],
  )

  const missionTargets = useMemo<MissionTargetMapData[]>(
    () =>
      robotDetails
        .filter((robot) => robot.missionId !== null)
        .flatMap((robot) => {
          const mission = missionByRobotId.get(robot.robotId)
          if (!mission) {
            return []
          }

          return {
            robotId: robot.robotId,
            target: mission.target,
            label:
              mode === 'warehouse'
                ? missionRouteLabel(mission.fromZoneId, mission.toZoneId) ??
                  mission.missionType
                : undefined,
          }
        }),
    [missionByRobotId, mode, robotDetails],
  )

  const selectedRobot = useMemo(
    () => robotDetails.find((robot) => robot.robotId === selectedRobotId) ?? null,
    [robotDetails, selectedRobotId],
  )
  const selectedRobotOperatorActions = useMemo(
    () => (selectedRobot ? operatorActionsByRobot[selectedRobot.robotId] : null),
    [operatorActionsByRobot, selectedRobot],
  )

  return (
    <section className="panel animate-shell-in space-y-4 p-5 [animation-delay:80ms]">
      <p className="text-xs uppercase tracking-[0.18em] text-muted">Live Map</p>
      <h2 className="mt-2 font-display text-lg font-semibold">Fleet Positioning and Route Context</h2>
      <p className="mt-3 max-w-3xl text-sm text-muted">
        Delivery mode uses MapLibre map overlays. Warehouse mode uses SVG floorplan zones. Both
        render live robot positions, trails, mission targets, and click-to-inspect side panel.
      </p>

      <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.12em] text-muted">
        <span className="rounded-pill border border-border/70 bg-surface-elevated/70 px-2.5 py-1">
          Mode {mode}
        </span>
        <span className="rounded-pill border border-border/70 bg-surface-elevated/70 px-2.5 py-1">
          Robots {robotDetails.length}
        </span>
        <span className="rounded-pill border border-border/70 bg-surface-elevated/70 px-2.5 py-1">
          Trails up to 24 points
        </span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        {mode === 'delivery' ? (
          <DeliveryMapCanvas
            missionTargets={missionTargets}
            onSelectRobot={setSelectedRobotId}
            robots={mapRobots}
            selectedRobotId={selectedRobotId}
            trailsByRobot={trailsByRobot}
          />
        ) : (
          <WarehouseFloorplanCanvas
            missionTargets={missionTargets}
            onSelectRobot={setSelectedRobotId}
            robots={mapRobots}
            selectedRobotId={selectedRobotId}
            trailsByRobot={trailsByRobot}
          />
        )}

        <aside className="map-overlay-surface h-[560px] p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-muted">Robot Side Panel</p>

          {!selectedRobot ? (
            <p className="mt-3 text-sm text-muted">
              Click a robot on the map or floorplan to inspect current status, mission, and metrics.
            </p>
          ) : (
            <div className="mt-3 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-xs">{selectedRobot.robotId}</p>
                <span
                  className={[
                    'rounded-pill px-2.5 py-1 text-xs font-semibold',
                    statusClassName[selectedRobot.status],
                  ].join(' ')}
                >
                  {selectedRobot.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-muted">
                <p>Battery: {selectedRobot.battery.toFixed(1)}%</p>
                <p>Temp: {selectedRobot.temp.toFixed(1)} C</p>
                <p>Speed: {selectedRobot.speed.toFixed(2)} m/s</p>
                <p>Confidence: {selectedRobot.localizationConfidence.toFixed(2)}</p>
                <p>Faults 24h: {selectedRobot.faults24h}</p>
                <p>
                  Pose: {selectedRobot.pose.x.toFixed(1)}, {selectedRobot.pose.y.toFixed(1)}
                </p>
              </div>

              <div className="rounded-panel border border-border/60 bg-surface-elevated/60 p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-muted">Mission</p>
                <p className="mt-1 font-mono text-xs">
                  {selectedRobot.missionId ?? 'NO-MISSION'}
                </p>
                <p className="mt-1 text-sm text-muted">
                  Type: {selectedRobot.missionType ?? 'n/a'}
                </p>
                {selectedRobot.missionRouteLabel ? (
                  <p className="mt-1 text-sm text-muted">Route: {selectedRobot.missionRouteLabel}</p>
                ) : null}
                <p className="mt-1 text-sm text-muted">
                  Progress:{' '}
                  {selectedRobot.missionProgress !== null
                    ? `${selectedRobot.missionProgress.toFixed(1)}%`
                    : 'n/a'}
                </p>
              </div>

              <div className="rounded-panel border border-border/60 bg-surface-elevated/60 p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-muted">Operator Actions</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    className="rounded-pill border border-border/70 bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition hover:border-status-need-assist/55"
                    onClick={() =>
                      requestOperatorAssistance({
                        robotId: selectedRobot.robotId,
                        missionId: selectedRobot.missionId,
                      })
                    }
                    type="button"
                  >
                    Request Assistance
                  </button>
                  <button
                    className="rounded-pill border border-border/70 bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition hover:border-accent/55 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={selectedRobot.missionId === null}
                    onClick={() =>
                      toggleRobotMissionPause({
                        robotId: selectedRobot.robotId,
                        missionId: selectedRobot.missionId,
                      })
                    }
                    type="button"
                  >
                    {selectedRobotOperatorActions?.missionPaused ? 'Resume Mission' : 'Pause Mission'}
                  </button>
                  <button
                    className="rounded-pill border border-border/70 bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition hover:border-status-fault/55"
                    onClick={() =>
                      createIncidentTicket({
                        robotId: selectedRobot.robotId,
                        missionId: selectedRobot.missionId,
                      })
                    }
                    type="button"
                  >
                    Create Incident Ticket
                  </button>
                </div>
                {selectedRobotOperatorActions?.lastActionLabel ? (
                  <p className="mt-2 text-xs text-muted">
                    Last action: {selectedRobotOperatorActions.lastActionLabel}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedRobotOperatorActions?.assistanceRequested ? (
                    <span className="rounded-pill bg-status-need-assist/20 px-2 py-1 text-xs text-status-need-assist">
                      Assistance requested
                    </span>
                  ) : null}
                  {selectedRobotOperatorActions?.missionPaused ? (
                    <span className="rounded-pill bg-accent-soft/65 px-2 py-1 text-xs text-accent">
                      Mission paused (local override)
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  className="rounded-pill border border-border/70 bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition hover:border-accent/45"
                  onClick={() => navigate(`/robots/${selectedRobot.robotId}`)}
                  type="button"
                >
                  Open Detail
                </button>
                <button
                  className="rounded-pill border border-border/70 bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition hover:border-accent/45"
                  onClick={() => setSelectedRobotId(null)}
                  type="button"
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </section>
  )
}
