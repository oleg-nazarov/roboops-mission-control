import type {
  EventMessage,
  FleetMissionSnapshot,
  FleetRobotSnapshot,
  HeartbeatMessage,
  IncidentMessage,
  OpsMode,
  TelemetryMessage,
  WsServerMessage,
} from '@roboops/contracts'

const defaultSensors = {
  lidar: 'OK',
  cam: 'OK',
  gps: 'OK',
  imu: 'OK',
} as const

export const buildFleetRobotSnapshot = (input: {
  robotId: string
  status: FleetRobotSnapshot['status']
  missionId?: string | null
  missionProgress?: number | null
  x?: number
  y?: number
  lastHeartbeatTs?: number
}): FleetRobotSnapshot => ({
  robotId: input.robotId,
  status: input.status,
  battery: 74.3,
  temp: 36.2,
  speed: input.status === 'ON_MISSION' ? 1.2 : 0,
  localizationConfidence: 0.93,
  lastHeartbeatTs: input.lastHeartbeatTs ?? 1_000,
  missionId: input.missionId ?? null,
  missionProgress: input.missionProgress ?? null,
  faults24h: input.status === 'FAULT' ? 2 : 0,
  pose: {
    x: input.x ?? 10,
    y: input.y ?? 10,
    heading: 0.1,
  },
  sensors: defaultSensors,
})

export const buildFleetMissionSnapshot = (input: {
  missionId: string
  robotId: string
  mode?: OpsMode
  missionType?: FleetMissionSnapshot['missionType']
  progress?: number
  x?: number
  y?: number
}): FleetMissionSnapshot => ({
  missionId: input.missionId,
  robotId: input.robotId,
  mode: input.mode ?? 'DELIVERY',
  missionType: input.missionType ?? 'DELIVERY',
  status: 'ACTIVE',
  progress: input.progress ?? 12.5,
  target: {
    x: input.x ?? 15,
    y: input.y ?? 22,
  },
  fromZoneId: null,
  toZoneId: null,
})

export const buildSnapshotMessage = (input?: {
  mode?: OpsMode
  streamSeq?: number
  serverTs?: number
  tick?: number
  robots?: FleetRobotSnapshot[]
  missions?: FleetMissionSnapshot[]
}): WsServerMessage => {
  const robots = input?.robots ?? [buildFleetRobotSnapshot({ robotId: 'RBT-001', status: 'IDLE' })]
  const missions = input?.missions ?? []

  const statusSummary = {
    IDLE: robots.filter((robot) => robot.status === 'IDLE').length,
    ON_MISSION: robots.filter((robot) => robot.status === 'ON_MISSION').length,
    NEED_ASSIST: robots.filter((robot) => robot.status === 'NEED_ASSIST').length,
    FAULT: robots.filter((robot) => robot.status === 'FAULT').length,
    OFFLINE: robots.filter((robot) => robot.status === 'OFFLINE').length,
  }

  const missionTypeSummary = {
    MOVE: missions.filter((mission) => mission.missionType === 'MOVE').length,
    BRING: missions.filter((mission) => mission.missionType === 'BRING').length,
    PICK: missions.filter((mission) => mission.missionType === 'PICK').length,
    DELIVERY: missions.filter((mission) => mission.missionType === 'DELIVERY').length,
  }

  return {
    type: 'snapshot',
    streamSeq: input?.streamSeq ?? 1,
    serverTs: input?.serverTs ?? 1_000,
    payload: {
      mode: input?.mode ?? 'DELIVERY',
      tick: input?.tick ?? 1,
      updatedAtTs: input?.serverTs ?? 1_000,
      robotCount: robots.length,
      missionCount: missions.length,
      statusSummary,
      missionTypeSummary,
      robots,
      missions,
    },
  }
}

export const buildTelemetryMessage = (input?: {
  streamSeq?: number
  serverTs?: number
  ts?: number
  robotId?: string
  mode?: OpsMode
  status?: TelemetryMessage['payload']['status']
  missionId?: string
  x?: number
  y?: number
  heading?: number
  speed?: number
  battery?: number
  temp?: number
  localizationConfidence?: number
}): TelemetryMessage => ({
  type: 'telemetry',
  streamSeq: input?.streamSeq ?? 2,
  serverTs: input?.serverTs ?? 1_050,
  payload: {
    type: 'telemetry',
    ts: input?.ts ?? 1_050,
    robotId: input?.robotId ?? 'RBT-001',
    mode: input?.mode ?? 'DELIVERY',
    status: input?.status ?? 'ON_MISSION',
    missionId: input?.missionId ?? 'MSN-00001',
    pose: {
      x: input?.x ?? 12.5,
      y: input?.y ?? 9.4,
      heading: input?.heading ?? 0.35,
    },
    speed: input?.speed ?? 1.3,
    battery: input?.battery ?? 75,
    temp: input?.temp ?? 37,
    localizationConfidence: input?.localizationConfidence ?? 0.91,
    sensors: defaultSensors,
  },
})

export const buildEventMessage = (input?: {
  streamSeq?: number
  serverTs?: number
  ts?: number
  robotId?: string
  missionId?: string
  level?: EventMessage['payload']['level']
  eventType?: string
  message?: string
  eventId?: string
}): EventMessage => ({
  type: 'event',
  streamSeq: input?.streamSeq ?? 3,
  serverTs: input?.serverTs ?? 1_100,
  payload: {
    type: 'event',
    ts: input?.ts ?? 1_100,
    robotId: input?.robotId ?? 'RBT-001',
    missionId: input?.missionId ?? 'MSN-00001',
    level: input?.level ?? 'WARN',
    eventType: input?.eventType ?? 'LOCALIZATION_DROPOUT',
    message: input?.message ?? 'Localization confidence dropped',
    meta: input?.eventId ? { eventId: input.eventId } : {},
  },
})

export const buildIncidentMessage = (input?: {
  streamSeq?: number
  serverTs?: number
  ts?: number
  incidentId?: string
  robotId?: string
  missionId?: string
  incidentType?: IncidentMessage['payload']['incidentType']
  severity?: IncidentMessage['payload']['severity']
  message?: string
}): IncidentMessage => ({
  type: 'incident',
  streamSeq: input?.streamSeq ?? 4,
  serverTs: input?.serverTs ?? 1_100,
  payload: {
    type: 'incident',
    ts: input?.ts ?? 1_100,
    incidentId: input?.incidentId ?? 'INC-000001',
    robotId: input?.robotId ?? 'RBT-001',
    missionId: input?.missionId ?? 'MSN-00001',
    incidentType: input?.incidentType ?? 'LOCALIZATION_DROPOUT',
    severity: input?.severity ?? 'HIGH',
    message: input?.message ?? 'Localization confidence dropped',
    resolved: false,
    meta: {},
  },
})

export const buildHeartbeatMessage = (input?: {
  streamSeq?: number
  serverTs?: number
  tick?: number
  mode?: OpsMode
  connectedClients?: number
  runId?: string
  reason?: string
}): HeartbeatMessage => ({
  type: 'heartbeat',
  streamSeq: input?.streamSeq ?? 5,
  serverTs: input?.serverTs ?? 1_200,
  payload: {
    tick: input?.tick ?? 8,
    mode: input?.mode ?? 'DELIVERY',
    connectedClients: input?.connectedClients ?? 1,
    runId: input?.runId ?? 'run-001',
    reason: input?.reason,
  },
})
