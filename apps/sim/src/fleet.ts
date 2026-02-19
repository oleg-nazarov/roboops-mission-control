import type { RobotStatus } from '@roboops/contracts'

const STATUS_ORDER: RobotStatus[] = [
  'IDLE',
  'ON_MISSION',
  'NEED_ASSIST',
  'FAULT',
  'OFFLINE',
]

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const randomFloat = (min: number, max: number): number => min + Math.random() * (max - min)

const randomInt = (min: number, max: number): number =>
  Math.floor(randomFloat(min, max + 1))

const randomHeadingDelta = (): number => randomFloat(-0.2, 0.2)

const formatRobotId = (index: number): string => `RBT-${String(index + 1).padStart(3, '0')}`

export type RobotRuntimeState = {
  robotId: string
  status: RobotStatus
  battery: number
  temp: number
  speed: number
  localizationConfidence: number
  lastHeartbeatTs: number
  missionId?: string
  faults24h: number
  pose: {
    x: number
    y: number
    heading: number
  }
  offlineUntilTs?: number
}

export type FleetRuntimeState = {
  robots: RobotRuntimeState[]
  tick: number
  updatedAtTs: number
  nextMissionSeq: number
}

const assignMission = (fleet: FleetRuntimeState): string => {
  const missionId = `MSN-${String(fleet.nextMissionSeq).padStart(5, '0')}`
  fleet.nextMissionSeq += 1
  return missionId
}

const setStatus = (fleet: FleetRuntimeState, robot: RobotRuntimeState, status: RobotStatus): void => {
  robot.status = status

  if (status === 'ON_MISSION') {
    robot.missionId = robot.missionId ?? assignMission(fleet)
    robot.speed = randomFloat(0.6, 1.6)
    return
  }

  if (status === 'OFFLINE') {
    robot.speed = 0
    robot.offlineUntilTs = fleet.updatedAtTs + randomInt(6_000, 12_000)
    return
  }

  robot.offlineUntilTs = undefined
  robot.speed = 0
  if (status !== 'NEED_ASSIST') {
    robot.missionId = undefined
  }
}

const updateBaseMetrics = (robot: RobotRuntimeState): void => {
  if (robot.status === 'ON_MISSION') {
    robot.battery = clamp(robot.battery - randomFloat(0.1, 0.5), 5, 100)
    robot.temp = clamp(robot.temp + randomFloat(-0.1, 0.25), 15, 85)
    robot.localizationConfidence = clamp(
      robot.localizationConfidence + randomFloat(-0.015, 0.01),
      0.7,
      1,
    )

    robot.pose.heading = (robot.pose.heading + randomHeadingDelta() + Math.PI * 2) % (Math.PI * 2)
    robot.pose.x += Math.cos(robot.pose.heading) * robot.speed * 0.15
    robot.pose.y += Math.sin(robot.pose.heading) * robot.speed * 0.15
    return
  }

  if (robot.status === 'IDLE') {
    robot.battery = clamp(robot.battery + randomFloat(0.08, 0.24), 5, 100)
    robot.temp = clamp(robot.temp + randomFloat(-0.25, 0.1), 15, 85)
    robot.localizationConfidence = clamp(
      robot.localizationConfidence + randomFloat(-0.005, 0.008),
      0.85,
      1,
    )
    return
  }

  if (robot.status === 'NEED_ASSIST') {
    robot.battery = clamp(robot.battery - randomFloat(0.03, 0.12), 5, 100)
    robot.temp = clamp(robot.temp + randomFloat(-0.08, 0.12), 15, 85)
    robot.localizationConfidence = clamp(
      robot.localizationConfidence + randomFloat(-0.02, 0.003),
      0.5,
      0.95,
    )
    return
  }

  if (robot.status === 'FAULT') {
    robot.battery = clamp(robot.battery - randomFloat(0.02, 0.1), 5, 100)
    robot.temp = clamp(robot.temp + randomFloat(-0.1, 0.2), 15, 85)
    robot.localizationConfidence = clamp(
      robot.localizationConfidence + randomFloat(-0.03, 0.002),
      0.35,
      0.9,
    )
  }
}

const applyTransitions = (fleet: FleetRuntimeState, robot: RobotRuntimeState): void => {
  if (robot.status === 'OFFLINE') {
    if ((robot.offlineUntilTs ?? 0) <= fleet.updatedAtTs) {
      setStatus(fleet, robot, 'IDLE')
    }
    return
  }

  if (Math.random() < 0.004) {
    setStatus(fleet, robot, 'OFFLINE')
    return
  }

  if (robot.status === 'IDLE' && Math.random() < 0.09) {
    setStatus(fleet, robot, 'ON_MISSION')
    return
  }

  if (robot.status === 'ON_MISSION' && Math.random() < 0.04) {
    setStatus(fleet, robot, 'IDLE')
    return
  }

  if (robot.status === 'ON_MISSION' && Math.random() < 0.02) {
    setStatus(fleet, robot, 'NEED_ASSIST')
    return
  }

  if (robot.status === 'NEED_ASSIST' && Math.random() < 0.22) {
    setStatus(fleet, robot, 'ON_MISSION')
    return
  }

  if (robot.status === 'FAULT' && Math.random() < 0.18) {
    setStatus(fleet, robot, 'IDLE')
    return
  }

  if (robot.status !== 'FAULT' && Math.random() < 0.007) {
    robot.faults24h += 1
    setStatus(fleet, robot, 'FAULT')
  }
}

export const createFleetState = (requestedCount: number, now: number): FleetRuntimeState => {
  const robotCount = clamp(Math.round(requestedCount), 6, 20)
  const state: FleetRuntimeState = {
    robots: [],
    tick: 0,
    updatedAtTs: now,
    nextMissionSeq: 1,
  }

  for (let index = 0; index < robotCount; index += 1) {
    const seededStatus = STATUS_ORDER[index % STATUS_ORDER.length]
    const robot: RobotRuntimeState = {
      robotId: formatRobotId(index),
      status: seededStatus,
      battery: randomFloat(45, 95),
      temp: randomFloat(28, 45),
      speed: 0,
      localizationConfidence: randomFloat(0.8, 0.99),
      lastHeartbeatTs: now,
      faults24h: randomInt(0, 3),
      pose: {
        x: randomFloat(0, 100),
        y: randomFloat(0, 100),
        heading: randomFloat(0, Math.PI * 2),
      },
    }

    if (seededStatus === 'ON_MISSION') {
      robot.missionId = assignMission(state)
      robot.speed = randomFloat(0.7, 1.5)
    }

    if (seededStatus === 'OFFLINE') {
      robot.offlineUntilTs = now + randomInt(4_000, 10_000)
    }

    state.robots.push(robot)
  }

  return state
}

export const tickFleetState = (fleet: FleetRuntimeState, now: number): void => {
  fleet.updatedAtTs = now
  fleet.tick += 1

  for (const robot of fleet.robots) {
    if (robot.status !== 'OFFLINE') {
      robot.lastHeartbeatTs = now
    }

    updateBaseMetrics(robot)
    applyTransitions(fleet, robot)
  }
}

export const summarizeFleetStatuses = (fleet: FleetRuntimeState): Record<RobotStatus, number> => {
  const summary: Record<RobotStatus, number> = {
    IDLE: 0,
    ON_MISSION: 0,
    NEED_ASSIST: 0,
    FAULT: 0,
    OFFLINE: 0,
  }

  for (const robot of fleet.robots) {
    summary[robot.status] += 1
  }

  return summary
}

export const getRandomTickDelay = (minMs: number, maxMs: number): number => {
  const safeMin = Math.max(200, Math.floor(minMs))
  const safeMax = Math.max(safeMin, Math.floor(maxMs))
  return randomInt(safeMin, safeMax)
}
