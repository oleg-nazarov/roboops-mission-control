import type {
  Event as OpsEvent,
  Incident as OpsIncident,
  IncidentType,
  MissionStatus,
  MissionType,
  OpsMode,
  RobotStatus,
  SensorHealth,
  Severity,
} from '@roboops/contracts'

const STATUS_ORDER: RobotStatus[] = [
  'IDLE',
  'ON_MISSION',
  'NEED_ASSIST',
  'FAULT',
  'OFFLINE',
]

const SENSOR_KEYS = ['lidar', 'cam', 'gps', 'imu'] as const
type SensorKey = (typeof SENSOR_KEYS)[number]

const WAREHOUSE_MISSION_TYPES: MissionType[] = ['MOVE', 'BRING', 'PICK']

const ANOMALY_COOLDOWN_MS = {
  localization: 9_000,
  sensorFail: 15_000,
  stuck: 10_000,
  offline: 16_000,
  geofence: 11_000,
} as const

const OFFLINE_ANOMALY_DURATION_MS = 10_000

type AnomalyKey = keyof typeof ANOMALY_COOLDOWN_MS

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const randomFloat = (min: number, max: number): number => min + Math.random() * (max - min)

const randomInt = (min: number, max: number): number =>
  Math.floor(randomFloat(min, max + 1))

const randomHeadingDelta = (): number => randomFloat(-0.2, 0.2)

const formatRobotId = (index: number): string => `RBT-${String(index + 1).padStart(3, '0')}`

const randomMissionTypeForMode = (mode: OpsMode): MissionType => {
  if (mode === 'DELIVERY') {
    return 'DELIVERY'
  }

  const index = randomInt(0, WAREHOUSE_MISSION_TYPES.length - 1)
  return WAREHOUSE_MISSION_TYPES[index]
}

const randomSensorStatus = (): SensorHealth => {
  const roll = Math.random()
  if (roll < 0.9) {
    return 'OK'
  }

  return 'WARN'
}

export type Waypoint = {
  x: number
  y: number
}

export type MissionRuntimeState = {
  missionId: string
  robotId: string
  mode: OpsMode
  missionType: MissionType
  status: MissionStatus
  progress: number
  waypoints: Waypoint[]
  target: Waypoint
  createdAtTs: number
  updatedAtTs: number
}

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
  sensors: Record<SensorKey, SensorHealth>
  stuckUntilTs?: number
  offlineUntilTs?: number
  anomalyCooldownUntilTs: Record<AnomalyKey, number>
}

export type FleetRuntimeState = {
  mode: OpsMode
  robots: RobotRuntimeState[]
  missions: Map<string, MissionRuntimeState>
  tick: number
  updatedAtTs: number
  modeChangedAtTs: number
  nextMissionSeq: number
  nextIncidentSeq: number
  nextEventSeq: number
}

export type FleetTickResult = {
  events: OpsEvent[]
  incidents: OpsIncident[]
}

const assignMissionId = (fleet: FleetRuntimeState): string => {
  const missionId = `MSN-${String(fleet.nextMissionSeq).padStart(5, '0')}`
  fleet.nextMissionSeq += 1
  return missionId
}

const assignIncidentId = (fleet: FleetRuntimeState): string => {
  const incidentId = `INC-${String(fleet.nextIncidentSeq).padStart(6, '0')}`
  fleet.nextIncidentSeq += 1
  return incidentId
}

const assignEventId = (fleet: FleetRuntimeState): string => {
  const eventId = `EVT-${String(fleet.nextEventSeq).padStart(6, '0')}`
  fleet.nextEventSeq += 1
  return eventId
}

const createRoute = (mode: OpsMode, origin: Waypoint): { waypoints: Waypoint[]; target: Waypoint } => {
  const waypointCount = mode === 'DELIVERY' ? randomInt(4, 7) : randomInt(3, 5)
  const waypoints: Waypoint[] = []
  let current = origin

  for (let index = 0; index < waypointCount; index += 1) {
    const next: Waypoint =
      mode === 'DELIVERY'
        ? {
            x: clamp(current.x + randomFloat(-11, 14), 0, 100),
            y: clamp(current.y + randomFloat(-11, 14), 0, 100),
          }
        : {
            x: clamp(current.x + randomFloat(-8, 8), 0, 100),
            y: clamp(current.y + (Math.random() < 0.5 ? 0 : randomFloat(-8, 8)), 0, 100),
          }

    waypoints.push(next)
    current = next
  }

  return {
    waypoints,
    target: waypoints[waypoints.length - 1],
  }
}

const getMissionForRobot = (
  fleet: FleetRuntimeState,
  robot: RobotRuntimeState,
): MissionRuntimeState | undefined => {
  if (!robot.missionId) {
    return undefined
  }

  return fleet.missions.get(robot.missionId)
}

const createMissionForRobot = (
  fleet: FleetRuntimeState,
  robot: RobotRuntimeState,
  now: number,
  initialStatus: MissionStatus,
): MissionRuntimeState => {
  const existingMission = getMissionForRobot(fleet, robot)

  if (existingMission && (existingMission.status === 'ACTIVE' || existingMission.status === 'PAUSED')) {
    existingMission.status = 'CANCELLED'
    existingMission.updatedAtTs = now
  }

  const missionId = assignMissionId(fleet)
  const route = createRoute(fleet.mode, { x: robot.pose.x, y: robot.pose.y })

  const mission: MissionRuntimeState = {
    missionId,
    robotId: robot.robotId,
    mode: fleet.mode,
    missionType: randomMissionTypeForMode(fleet.mode),
    status: initialStatus,
    progress: 0,
    waypoints: route.waypoints,
    target: route.target,
    createdAtTs: now,
    updatedAtTs: now,
  }

  fleet.missions.set(missionId, mission)
  robot.missionId = missionId
  return mission
}

const ensureMissionForRobot = (
  fleet: FleetRuntimeState,
  robot: RobotRuntimeState,
  now: number,
  initialStatus: MissionStatus,
): MissionRuntimeState => {
  const existing = getMissionForRobot(fleet, robot)
  if (existing) {
    return existing
  }

  return createMissionForRobot(fleet, robot, now, initialStatus)
}

const setStatus = (
  fleet: FleetRuntimeState,
  robot: RobotRuntimeState,
  status: RobotStatus,
  options?: { offlineDurationMs?: number },
): void => {
  robot.status = status
  const now = fleet.updatedAtTs

  if (status === 'ON_MISSION') {
    const mission = ensureMissionForRobot(fleet, robot, now, 'ACTIVE')
    mission.status = 'ACTIVE'
    mission.updatedAtTs = now
    robot.speed = randomFloat(0.6, 1.8)
    robot.offlineUntilTs = undefined
    return
  }

  if (status === 'NEED_ASSIST') {
    const mission = ensureMissionForRobot(fleet, robot, now, 'PAUSED')
    mission.status = 'PAUSED'
    mission.updatedAtTs = now
    robot.speed = 0
    robot.offlineUntilTs = undefined
    return
  }

  if (status === 'FAULT') {
    const mission = getMissionForRobot(fleet, robot)
    if (mission) {
      mission.status = 'FAILED'
      mission.updatedAtTs = now
    }
    robot.speed = 0
    robot.missionId = undefined
    robot.stuckUntilTs = undefined
    robot.offlineUntilTs = undefined
    return
  }

  if (status === 'OFFLINE') {
    robot.speed = 0
    robot.offlineUntilTs = now + (options?.offlineDurationMs ?? randomInt(6_000, 12_000))
    const mission = getMissionForRobot(fleet, robot)
    if (mission && mission.status === 'ACTIVE') {
      mission.status = 'PAUSED'
      mission.updatedAtTs = now
    }
    return
  }

  const mission = getMissionForRobot(fleet, robot)
  if (mission && mission.status !== 'COMPLETED' && mission.status !== 'FAILED') {
    mission.status = 'COMPLETED'
    mission.progress = Math.max(mission.progress, 100)
    mission.updatedAtTs = now
  }

  robot.speed = 0
  robot.missionId = undefined
  robot.stuckUntilTs = undefined
  robot.offlineUntilTs = undefined
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
      0.45,
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

const updateSensorRecovery = (robot: RobotRuntimeState): void => {
  for (const key of SENSOR_KEYS) {
    const state = robot.sensors[key]
    if (state === 'FAIL' && robot.status !== 'OFFLINE' && Math.random() < 0.06) {
      robot.sensors[key] = 'WARN'
      continue
    }

    if (state === 'WARN' && Math.random() < 0.08) {
      robot.sensors[key] = 'OK'
    }
  }
}

const updateMissionProgress = (fleet: FleetRuntimeState, robot: RobotRuntimeState): void => {
  if (robot.status !== 'ON_MISSION') {
    return
  }

  const mission = ensureMissionForRobot(fleet, robot, fleet.updatedAtTs, 'ACTIVE')
  mission.mode = fleet.mode
  mission.updatedAtTs = fleet.updatedAtTs
  mission.status = 'ACTIVE'

  if (robot.stuckUntilTs && robot.stuckUntilTs > fleet.updatedAtTs) {
    mission.status = 'PAUSED'
    robot.speed = 0
    return
  }

  if (robot.stuckUntilTs && robot.stuckUntilTs <= fleet.updatedAtTs) {
    robot.stuckUntilTs = undefined
    robot.speed = randomFloat(0.7, 1.7)
  }

  mission.progress = clamp(mission.progress + randomFloat(1.8, 5.6), 0, 100)

  const waypointIndex = Math.min(
    mission.waypoints.length - 1,
    Math.floor((mission.progress / 100) * mission.waypoints.length),
  )
  mission.target = mission.waypoints[waypointIndex]

  const dx = mission.target.x - robot.pose.x
  const dy = mission.target.y - robot.pose.y
  const distance = Math.hypot(dx, dy)
  if (distance > 0.0001) {
    robot.pose.heading = Math.atan2(dy, dx)
    const step = Math.min(distance, robot.speed * 0.2)
    robot.pose.x += (dx / distance) * step
    robot.pose.y += (dy / distance) * step
  } else {
    robot.pose.heading = (robot.pose.heading + randomHeadingDelta() + Math.PI * 2) % (Math.PI * 2)
  }

  if (mission.progress >= 100) {
    mission.status = 'COMPLETED'
    mission.updatedAtTs = fleet.updatedAtTs
    robot.missionId = undefined
    robot.status = 'IDLE'
    robot.speed = 0
  }
}

const applyTransitions = (fleet: FleetRuntimeState, robot: RobotRuntimeState): void => {
  if (robot.status === 'OFFLINE') {
    if ((robot.offlineUntilTs ?? 0) <= fleet.updatedAtTs) {
      setStatus(fleet, robot, 'IDLE')
    }
    return
  }

  if (robot.status === 'IDLE' && Math.random() < 0.08) {
    setStatus(fleet, robot, 'ON_MISSION')
    return
  }

  if (robot.status === 'ON_MISSION' && Math.random() < 0.02) {
    setStatus(fleet, robot, 'IDLE')
    return
  }

  if (robot.status === 'NEED_ASSIST' && (!robot.stuckUntilTs || robot.stuckUntilTs <= fleet.updatedAtTs)) {
    if (Math.random() < 0.22) {
      setStatus(fleet, robot, 'ON_MISSION')
      return
    }
  }

  if (robot.status === 'FAULT' && Math.random() < 0.18) {
    for (const key of SENSOR_KEYS) {
      robot.sensors[key] = 'OK'
    }
    setStatus(fleet, robot, 'IDLE')
  }
}

const canTriggerAnomaly = (robot: RobotRuntimeState, kind: AnomalyKey, now: number): boolean =>
  now >= robot.anomalyCooldownUntilTs[kind]

const setAnomalyCooldown = (robot: RobotRuntimeState, kind: AnomalyKey, now: number): void => {
  robot.anomalyCooldownUntilTs[kind] = now + ANOMALY_COOLDOWN_MS[kind]
}

const pushAnomalySignal = (
  fleet: FleetRuntimeState,
  robot: RobotRuntimeState,
  bucket: FleetTickResult,
  payload: {
    incidentType: IncidentType
    severity: Severity
    eventType: string
    level: 'WARN' | 'ERROR'
    message: string
    meta?: Record<string, unknown>
  },
): void => {
  const ts = fleet.updatedAtTs
  const missionId = robot.missionId
  const eventId = assignEventId(fleet)
  const incidentId = assignIncidentId(fleet)
  const meta = {
    ...(payload.meta ?? {}),
    eventId,
    mode: fleet.mode,
  }

  const event: OpsEvent = {
    type: 'event',
    ts,
    robotId: robot.robotId,
    missionId,
    level: payload.level,
    eventType: payload.eventType,
    message: payload.message,
    meta,
  }

  const incident: OpsIncident = {
    type: 'incident',
    ts,
    incidentId,
    robotId: robot.robotId,
    missionId,
    incidentType: payload.incidentType,
    severity: payload.severity,
    message: payload.message,
    resolved: false,
    meta: {
      ...meta,
      linkedEventType: payload.eventType,
    },
  }

  bucket.events.push(event)
  bucket.incidents.push(incident)
}

const applyAnomalies = (fleet: FleetRuntimeState, robot: RobotRuntimeState, bucket: FleetTickResult): void => {
  const now = fleet.updatedAtTs

  if (
    robot.status === 'ON_MISSION' &&
    canTriggerAnomaly(robot, 'localization', now) &&
    Math.random() < 0.015
  ) {
    setAnomalyCooldown(robot, 'localization', now)
    robot.localizationConfidence = clamp(randomFloat(0.14, 0.34), 0, 1)
    setStatus(fleet, robot, 'NEED_ASSIST')
    pushAnomalySignal(fleet, robot, bucket, {
      incidentType: 'LOCALIZATION_DROPOUT',
      severity: 'HIGH',
      eventType: 'LOCALIZATION_DROPOUT',
      level: 'ERROR',
      message: 'Localization confidence dropped below safety threshold',
      meta: {
        localizationConfidence: Number(robot.localizationConfidence.toFixed(3)),
      },
    })
    return
  }

  if (robot.status !== 'OFFLINE' && canTriggerAnomaly(robot, 'sensorFail', now) && Math.random() < 0.008) {
    setAnomalyCooldown(robot, 'sensorFail', now)
    const sensorKey = SENSOR_KEYS[randomInt(0, SENSOR_KEYS.length - 1)]
    robot.sensors[sensorKey] = 'FAIL'
    setStatus(fleet, robot, 'FAULT')
    pushAnomalySignal(fleet, robot, bucket, {
      incidentType: 'SENSOR_FAIL',
      severity: 'CRITICAL',
      eventType: 'SENSOR_FAIL',
      level: 'ERROR',
      message: `Sensor ${sensorKey.toUpperCase()} reported FAIL`,
      meta: { sensor: sensorKey },
    })
    return
  }

  if (robot.status === 'ON_MISSION' && canTriggerAnomaly(robot, 'stuck', now) && Math.random() < 0.012) {
    setAnomalyCooldown(robot, 'stuck', now)
    robot.stuckUntilTs = now + randomInt(4_000, 8_000)
    robot.speed = 0
    setStatus(fleet, robot, 'NEED_ASSIST')
    pushAnomalySignal(fleet, robot, bucket, {
      incidentType: 'STUCK',
      severity: 'MEDIUM',
      eventType: 'STUCK',
      level: 'WARN',
      message: 'Robot movement stalled during mission execution',
      meta: {
        stuckUntilTs: robot.stuckUntilTs,
      },
    })
    return
  }

  if (robot.status !== 'OFFLINE' && canTriggerAnomaly(robot, 'offline', now) && Math.random() < 0.0045) {
    setAnomalyCooldown(robot, 'offline', now)
    setStatus(fleet, robot, 'OFFLINE', { offlineDurationMs: OFFLINE_ANOMALY_DURATION_MS })
    pushAnomalySignal(fleet, robot, bucket, {
      incidentType: 'SENSOR_FAIL',
      severity: 'HIGH',
      eventType: 'OFFLINE_TIMEOUT',
      level: 'ERROR',
      message: 'Robot lost connectivity and went offline for 10 seconds',
      meta: { offlineDurationMs: OFFLINE_ANOMALY_DURATION_MS },
    })
    return
  }

  if (
    fleet.mode === 'DELIVERY' &&
    robot.status === 'ON_MISSION' &&
    canTriggerAnomaly(robot, 'geofence', now) &&
    Math.random() < 0.006
  ) {
    setAnomalyCooldown(robot, 'geofence', now)
    robot.pose.x = Math.random() < 0.5 ? -randomFloat(1, 4) : 100 + randomFloat(1, 4)
    robot.pose.y = clamp(robot.pose.y + randomFloat(-2, 2), 0, 100)
    setStatus(fleet, robot, 'NEED_ASSIST')
    pushAnomalySignal(fleet, robot, bucket, {
      incidentType: 'GEOFENCE_VIOLATION',
      severity: 'CRITICAL',
      eventType: 'GEOFENCE_VIOLATION',
      level: 'ERROR',
      message: 'Robot crossed geofence boundary during delivery route',
      meta: {
        pose: {
          x: Number(robot.pose.x.toFixed(2)),
          y: Number(robot.pose.y.toFixed(2)),
        },
      },
    })
  }
}

export const createFleetState = (
  requestedCount: number,
  now: number,
  mode: OpsMode,
): FleetRuntimeState => {
  const robotCount = clamp(Math.round(requestedCount), 6, 20)
  const state: FleetRuntimeState = {
    mode,
    robots: [],
    missions: new Map<string, MissionRuntimeState>(),
    tick: 0,
    updatedAtTs: now,
    modeChangedAtTs: now,
    nextMissionSeq: 1,
    nextIncidentSeq: 1,
    nextEventSeq: 1,
  }

  for (let index = 0; index < robotCount; index += 1) {
    const seededStatus = STATUS_ORDER[index % STATUS_ORDER.length]

    const robot: RobotRuntimeState = {
      robotId: formatRobotId(index),
      status: 'IDLE',
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
      sensors: {
        lidar: randomSensorStatus(),
        cam: randomSensorStatus(),
        gps: randomSensorStatus(),
        imu: randomSensorStatus(),
      },
      anomalyCooldownUntilTs: {
        localization: 0,
        sensorFail: 0,
        stuck: 0,
        offline: 0,
        geofence: 0,
      },
    }

    state.robots.push(robot)

    if (seededStatus === 'ON_MISSION') {
      setStatus(state, robot, 'ON_MISSION')
      continue
    }

    if (seededStatus === 'NEED_ASSIST') {
      setStatus(state, robot, 'ON_MISSION')
      setStatus(state, robot, 'NEED_ASSIST')
      continue
    }

    if (seededStatus === 'FAULT') {
      setStatus(state, robot, 'FAULT')
      continue
    }

    if (seededStatus === 'OFFLINE') {
      setStatus(state, robot, 'OFFLINE')
    }
  }

  return state
}

export const switchFleetMode = (fleet: FleetRuntimeState, mode: OpsMode, now: number): boolean => {
  if (fleet.mode === mode) {
    return false
  }

  fleet.mode = mode
  fleet.modeChangedAtTs = now
  fleet.updatedAtTs = now

  for (const robot of fleet.robots) {
    if (robot.status === 'ON_MISSION') {
      createMissionForRobot(fleet, robot, now, 'ACTIVE')
      continue
    }

    if (robot.status === 'NEED_ASSIST') {
      createMissionForRobot(fleet, robot, now, 'PAUSED')
    }
  }

  return true
}

export const tickFleetState = (fleet: FleetRuntimeState, now: number): FleetTickResult => {
  fleet.updatedAtTs = now
  fleet.tick += 1

  const result: FleetTickResult = {
    events: [],
    incidents: [],
  }

  for (const robot of fleet.robots) {
    if (robot.status !== 'OFFLINE') {
      robot.lastHeartbeatTs = now
    }

    updateBaseMetrics(robot)
    updateSensorRecovery(robot)
    updateMissionProgress(fleet, robot)
    applyTransitions(fleet, robot)
    applyAnomalies(fleet, robot, result)
  }

  return result
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

export const summarizeMissionTypes = (fleet: FleetRuntimeState): Record<MissionType, number> => {
  const summary: Record<MissionType, number> = {
    MOVE: 0,
    BRING: 0,
    PICK: 0,
    DELIVERY: 0,
  }

  for (const mission of fleet.missions.values()) {
    if (mission.status === 'ACTIVE' || mission.status === 'PAUSED') {
      summary[mission.missionType] += 1
    }
  }

  return summary
}

export const getRandomTickDelay = (minMs: number, maxMs: number): number => {
  const safeMin = Math.max(200, Math.floor(minMs))
  const safeMax = Math.max(safeMin, Math.floor(maxMs))
  return randomInt(safeMin, safeMax)
}
