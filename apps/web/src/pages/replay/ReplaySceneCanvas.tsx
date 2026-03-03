import { useMemo } from 'react'
import type { RobotStatus } from '@roboops/contracts'
import { statusHexByRobotStatus, warehousePointToSvg } from '../live-map/mapUtils'

type ReplayTrajectoryPoint = {
  ts: number
  x: number
  y: number
  heading: number
  status: RobotStatus
}

type ReplaySceneCanvasProps = {
  mode: 'DELIVERY' | 'WAREHOUSE'
  robotId: string
  trajectory: ReplayTrajectoryPoint[]
  cursorTs: number
}

type SvgPoint = {
  x: number
  y: number
}

const deliveryPointToSvg = (point: { x: number; y: number }): SvgPoint => ({
  x: 40 + point.x * 8.8,
  y: 520 - point.y * 4.6,
})

const warehouseZones = [
  { id: 'inbound', label: 'Inbound', x: 70, y: 70, width: 220, height: 180 },
  { id: 'high-bay', label: 'High Bay', x: 320, y: 70, width: 340, height: 180 },
  { id: 'packing', label: 'Packing', x: 690, y: 70, width: 190, height: 180 },
  { id: 'outbound', label: 'Outbound', x: 70, y: 300, width: 810, height: 220 },
] as const

const deliveryGeofences = [
  { id: 'pedestrian-corridor', points: [{ x: 8, y: 20 }, { x: 82, y: 22 }, { x: 86, y: 44 }, { x: 12, y: 46 }] },
  { id: 'restricted-crossing', points: [{ x: 38, y: 56 }, { x: 60, y: 57 }, { x: 63, y: 76 }, { x: 34, y: 74 }] },
] as const

const deliveryRoadSegments = [
  { id: 'road-h-1', points: [{ x: 0, y: 42 }, { x: 100, y: 42 }] },
  { id: 'road-h-2', points: [{ x: 0, y: 52 }, { x: 100, y: 52 }] },
  { id: 'road-v-1', points: [{ x: 33, y: 0 }, { x: 33, y: 100 }] },
  { id: 'road-v-2', points: [{ x: 66, y: 0 }, { x: 66, y: 100 }] },
] as const

const toPolyline = (points: SvgPoint[]): string =>
  points.map((point) => `${point.x},${point.y}`).join(' ')

const closestPointAtCursor = (trajectory: ReplayTrajectoryPoint[], cursorTs: number): ReplayTrajectoryPoint | null => {
  if (trajectory.length === 0) {
    return null
  }

  let best = trajectory[0]
  let bestDistance = Math.abs(trajectory[0].ts - cursorTs)
  for (let index = 1; index < trajectory.length; index += 1) {
    const distance = Math.abs(trajectory[index].ts - cursorTs)
    if (distance < bestDistance) {
      best = trajectory[index]
      bestDistance = distance
    }
  }

  return best
}

const pointsUntilCursor = (trajectory: ReplayTrajectoryPoint[], cursorTs: number): ReplayTrajectoryPoint[] => {
  if (trajectory.length <= 1) {
    return trajectory
  }

  const points = trajectory.filter((point) => point.ts <= cursorTs)
  if (points.length >= 2) {
    return points
  }

  return trajectory.slice(0, 1)
}

export function ReplaySceneCanvas({ mode, robotId, trajectory, cursorTs }: ReplaySceneCanvasProps) {
  const currentPoint = useMemo(() => closestPointAtCursor(trajectory, cursorTs), [cursorTs, trajectory])
  const playedPoints = useMemo(() => pointsUntilCursor(trajectory, cursorTs), [cursorTs, trajectory])
  const lastPoint = trajectory.length > 0 ? trajectory[trajectory.length - 1] : null

  const toSvg = mode === 'DELIVERY' ? deliveryPointToSvg : warehousePointToSvg
  const pathPoints = trajectory.map((point) => toSvg(point))
  const playedPathPoints = playedPoints.map((point) => toSvg(point))
  const currentSvgPoint = currentPoint ? toSvg(currentPoint) : null
  const endSvgPoint = lastPoint ? toSvg(lastPoint) : null

  return (
    <div className="relative h-[460px] overflow-hidden rounded-panel border border-border/60 bg-surface-elevated/50">
      <svg className="h-full w-full" viewBox="0 0 960 600">
        <rect fill="hsl(var(--ui-color-bg) / 0.88)" height="600" width="960" x="0" y="0" />

        {mode === 'WAREHOUSE' ? (
          <>
            <g stroke="hsl(var(--ui-color-border) / 0.35)" strokeDasharray="3 8" strokeWidth="1">
              {Array.from({ length: 12 }).map((_, index) => (
                <line key={`vertical-${index}`} x1={index * 80} x2={index * 80} y1="0" y2="600" />
              ))}
              {Array.from({ length: 8 }).map((_, index) => (
                <line key={`horizontal-${index}`} x1="0" x2="960" y1={index * 75} y2={index * 75} />
              ))}
            </g>
            {warehouseZones.map((zone) => (
              <g key={zone.id}>
                <rect
                  className="floorplan-zone"
                  height={zone.height}
                  rx={12}
                  width={zone.width}
                  x={zone.x}
                  y={zone.y}
                />
                <text
                  fill="hsl(var(--ui-color-text) / 0.8)"
                  fontSize="12"
                  fontWeight="600"
                  x={zone.x + 12}
                  y={zone.y + 24}
                >
                  {zone.label}
                </text>
              </g>
            ))}
          </>
        ) : (
          <>
            {deliveryRoadSegments.map((segment) => (
              <polyline
                fill="none"
                key={segment.id}
                points={toPolyline(segment.points.map((point) => deliveryPointToSvg(point)))}
                stroke="hsl(var(--ui-color-accent) / 0.42)"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="4"
              />
            ))}
            {deliveryGeofences.map((zone) => (
              <polygon
                fill="hsl(var(--ui-color-accent-soft) / 0.2)"
                key={zone.id}
                points={toPolyline(zone.points.map((point) => deliveryPointToSvg(point)))}
                stroke="hsl(var(--ui-color-accent) / 0.65)"
                strokeDasharray="6 8"
                strokeWidth="1.5"
              />
            ))}
          </>
        )}

        {pathPoints.length >= 2 ? (
          <polyline
            fill="none"
            points={toPolyline(pathPoints)}
            stroke="hsl(var(--ui-color-muted) / 0.45)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.2"
          />
        ) : null}

        {playedPathPoints.length >= 2 ? (
          <polyline
            fill="none"
            points={toPolyline(playedPathPoints)}
            stroke={statusHexByRobotStatus[currentPoint?.status ?? 'OFFLINE']}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3.6"
          />
        ) : null}

        {endSvgPoint ? (
          <g>
            <line
              stroke="hsl(var(--ui-color-accent) / 0.78)"
              strokeLinecap="round"
              strokeWidth="2.6"
              x1={endSvgPoint.x}
              x2={endSvgPoint.x}
              y1={endSvgPoint.y}
              y2={endSvgPoint.y - 18}
            />
            <polygon
              fill="hsl(var(--ui-color-accent) / 0.82)"
              points={`${endSvgPoint.x},${endSvgPoint.y - 18} ${endSvgPoint.x + 14},${endSvgPoint.y - 22} ${endSvgPoint.x},${endSvgPoint.y - 27}`}
            />
          </g>
        ) : null}

        {currentSvgPoint ? (
          <g>
            <circle
              cx={currentSvgPoint.x}
              cy={currentSvgPoint.y}
              fill={statusHexByRobotStatus[currentPoint?.status ?? 'OFFLINE']}
              r="8.5"
              stroke="#0f1a24"
              strokeWidth="2"
            />
            <text
              fill="hsl(var(--ui-color-text) / 0.85)"
              fontFamily="var(--ui-font-body)"
              fontSize="10"
              textAnchor="middle"
              x={currentSvgPoint.x}
              y={currentSvgPoint.y - 12}
            >
              {robotId}
            </text>
          </g>
        ) : null}
      </svg>

      <div className="map-overlay-surface absolute left-3 top-3 px-3 py-2 text-xs">
        {mode === 'DELIVERY' ? 'Replay scene: Delivery' : 'Replay scene: Warehouse'}
      </div>
    </div>
  )
}
