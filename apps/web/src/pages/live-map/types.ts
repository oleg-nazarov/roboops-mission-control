import type { RobotStatus } from '@roboops/contracts'

export type SimPoint = {
  x: number
  y: number
}

export type LiveRobotMapData = {
  robotId: string
  status: RobotStatus
  pose: SimPoint
}

export type MissionTargetMapData = {
  robotId: string
  target: SimPoint
  label?: string
}
