import { statusHexByRobotStatus, warehousePointToSvg } from './mapUtils'
import type { LiveRobotMapData, MissionTargetMapData } from './types'

type TrailPoint = {
  ts: number
  x: number
  y: number
  heading: number
}

type WarehouseFloorplanCanvasProps = {
  robots: LiveRobotMapData[]
  missionTargets: MissionTargetMapData[]
  trailsByRobot: Record<string, TrailPoint[]>
  selectedRobotId: string | null
  onSelectRobot: (robotId: string | null) => void
}

const warehouseZones = [
  { id: 'inbound', label: 'Inbound', x: 70, y: 70, width: 220, height: 180 },
  { id: 'high-bay', label: 'High Bay', x: 320, y: 70, width: 340, height: 180 },
  { id: 'packing', label: 'Packing', x: 690, y: 70, width: 190, height: 180 },
  { id: 'outbound', label: 'Outbound', x: 70, y: 300, width: 810, height: 220 },
] as const

export function WarehouseFloorplanCanvas({
  robots,
  missionTargets,
  trailsByRobot,
  selectedRobotId,
  onSelectRobot,
}: WarehouseFloorplanCanvasProps) {
  return (
    <div className="relative h-[560px] overflow-hidden rounded-panel border border-border/70 bg-surface">
      <svg className="h-full w-full" viewBox="0 0 960 600">
        <rect fill="hsl(var(--ui-color-bg) / 0.85)" height="600" width="960" x="0" y="0" />
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
              fontSize="13"
              fontWeight="600"
              x={zone.x + 12}
              y={zone.y + 24}
            >
              {zone.label}
            </text>
          </g>
        ))}

        {robots.map((robot) => {
          const trail = trailsByRobot[robot.robotId] ?? []
          if (trail.length < 2) {
            return null
          }

          const points = trail
            .map((point) => {
              const svgPoint = warehousePointToSvg(point)
              return `${svgPoint.x},${svgPoint.y}`
            })
            .join(' ')

          return (
            <polyline
              fill="none"
              key={`trail-${robot.robotId}`}
              points={points}
              stroke={statusHexByRobotStatus[robot.status]}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeOpacity={selectedRobotId === robot.robotId ? 1 : 0.65}
              strokeWidth={selectedRobotId === robot.robotId ? 3.4 : 2.2}
            />
          )
        })}

        {missionTargets.map((target) => {
          const point = warehousePointToSvg(target.target)
          const isSelected = selectedRobotId === target.robotId
          const poleTopY = point.y - 16
          return (
            <g
              className="cursor-pointer"
              key={`target-${target.robotId}`}
              onClick={() => onSelectRobot(target.robotId)}
            >
              <line
                stroke="#d8be7a"
                strokeLinecap="round"
                strokeWidth={isSelected ? 3.2 : 2.4}
                x1={point.x}
                x2={point.x}
                y1={point.y}
                y2={poleTopY}
              />
              <polygon
                fill="#d9a544"
                opacity={isSelected ? 0.98 : 0.9}
                points={`${point.x},${poleTopY} ${point.x + 14},${poleTopY - 4} ${point.x},${poleTopY - 9}`}
                stroke="#f1dda9"
                strokeWidth={isSelected ? 2.1 : 1.5}
              />
              {target.label ? (
                <text
                  fill="hsl(var(--ui-color-text) / 0.9)"
                  fontFamily="var(--ui-font-body)"
                  fontSize="9"
                  textAnchor="start"
                  x={point.x + 8}
                  y={point.y + 11}
                >
                  {target.label}
                </text>
              ) : null}
            </g>
          )
        })}

        {robots.map((robot) => {
          const point = warehousePointToSvg(robot.pose)
          const isSelected = selectedRobotId === robot.robotId

          return (
            <g
              className="cursor-pointer"
              key={robot.robotId}
              onClick={() => onSelectRobot(robot.robotId)}
            >
              <circle
                cx={point.x}
                cy={point.y}
                fill={statusHexByRobotStatus[robot.status]}
                r={isSelected ? 9 : 7}
                stroke="#0f1a24"
                strokeWidth="2"
              />
              <text
                fill="hsl(var(--ui-color-text) / 0.85)"
                fontFamily="var(--ui-font-body)"
                fontSize="10"
                textAnchor="middle"
                x={point.x}
                y={point.y - 11}
              >
                {robot.robotId}
              </text>
            </g>
          )
        })}
      </svg>

      <div className="map-overlay-surface absolute left-3 top-3 px-3 py-2 text-xs">
        Warehouse zones and AMR routes
      </div>

      <button
        className="map-overlay-surface absolute bottom-3 right-3 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.1em]"
        onClick={() => onSelectRobot(null)}
        type="button"
      >
        Clear Selection
      </button>
    </div>
  )
}
