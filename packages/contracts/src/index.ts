import { z } from 'zod'

export const opsModeSchema = z.enum(['DELIVERY', 'WAREHOUSE'])
export type OpsMode = z.infer<typeof opsModeSchema>

export const robotStatusSchema = z.enum([
  'IDLE',
  'ON_MISSION',
  'NEED_ASSIST',
  'FAULT',
  'OFFLINE',
])
export type RobotStatus = z.infer<typeof robotStatusSchema>

export const sensorHealthSchema = z.enum(['OK', 'WARN', 'FAIL'])
export type SensorHealth = z.infer<typeof sensorHealthSchema>

export const eventLevelSchema = z.enum(['INFO', 'WARN', 'ERROR'])
export type EventLevel = z.infer<typeof eventLevelSchema>

export const incidentTypeSchema = z.enum([
  'LOCALIZATION_DROPOUT',
  'OBSTACLE_BLOCKED',
  'STUCK',
  'SENSOR_FAIL',
  'GEOFENCE_VIOLATION',
])
export type IncidentType = z.infer<typeof incidentTypeSchema>

export const severitySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
export type Severity = z.infer<typeof severitySchema>

export const missionTypeSchema = z.enum(['MOVE', 'BRING', 'PICK', 'DELIVERY'])
export type MissionType = z.infer<typeof missionTypeSchema>

export const missionStatusSchema = z.enum([
  'PENDING',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
])
export type MissionStatus = z.infer<typeof missionStatusSchema>

export const poseSchema = z.object({
  x: z.number(),
  y: z.number(),
  heading: z.number(),
})
export type Pose = z.infer<typeof poseSchema>

export const waypointSchema = z.object({
  x: z.number(),
  y: z.number(),
})
export type Waypoint = z.infer<typeof waypointSchema>

export const telemetrySchema = z.object({
  type: z.literal('telemetry'),
  ts: z.number().int().nonnegative(),
  robotId: z.string().min(1),
  mode: opsModeSchema.optional(),
  status: robotStatusSchema.optional(),
  missionId: z.string().min(1).optional(),
  pose: poseSchema,
  speed: z.number().min(0),
  battery: z.number().min(0).max(100),
  temp: z.number(),
  localizationConfidence: z.number().min(0).max(1),
  sensors: z.object({
    lidar: sensorHealthSchema,
    cam: sensorHealthSchema,
    gps: sensorHealthSchema,
    imu: sensorHealthSchema,
  }),
})
export type Telemetry = z.infer<typeof telemetrySchema>

export const eventSchema = z.object({
  type: z.literal('event'),
  ts: z.number().int().nonnegative(),
  robotId: z.string().min(1),
  missionId: z.string().min(1).optional(),
  level: eventLevelSchema,
  eventType: z.string().min(1),
  message: z.string().min(1),
  meta: z.record(z.string(), z.unknown()).default({}),
})
export type Event = z.infer<typeof eventSchema>

export const missionSchema = z.object({
  type: z.literal('mission'),
  ts: z.number().int().nonnegative(),
  missionId: z.string().min(1),
  robotId: z.string().min(1),
  mode: opsModeSchema.optional(),
  missionType: missionTypeSchema,
  waypoints: z.array(waypointSchema).min(1),
  target: waypointSchema.optional(),
  status: missionStatusSchema,
  progress: z.number().min(0).max(100),
})
export type Mission = z.infer<typeof missionSchema>

export const incidentSchema = z.object({
  type: z.literal('incident'),
  ts: z.number().int().nonnegative(),
  incidentId: z.string().min(1),
  robotId: z.string().min(1),
  missionId: z.string().min(1).optional(),
  incidentType: incidentTypeSchema,
  severity: severitySchema,
  message: z.string().min(1),
  resolved: z.boolean().default(false),
  meta: z.record(z.string(), z.unknown()).default({}),
})
export type Incident = z.infer<typeof incidentSchema>

export const opsRecordSchema = z.discriminatedUnion('type', [
  telemetrySchema,
  eventSchema,
  missionSchema,
  incidentSchema,
])
export type OpsRecord = z.infer<typeof opsRecordSchema>

export const fleetRobotSnapshotSchema = z.object({
  robotId: z.string().min(1),
  status: robotStatusSchema,
  battery: z.number(),
  temp: z.number(),
  speed: z.number(),
  localizationConfidence: z.number().min(0).max(1),
  lastHeartbeatTs: z.number().int().nonnegative(),
  missionId: z.string().min(1).nullable(),
  missionProgress: z.number().min(0).max(100).nullable(),
  faults24h: z.number().int().nonnegative(),
  pose: poseSchema,
  sensors: z.object({
    lidar: sensorHealthSchema,
    cam: sensorHealthSchema,
    gps: sensorHealthSchema,
    imu: sensorHealthSchema,
  }),
})
export type FleetRobotSnapshot = z.infer<typeof fleetRobotSnapshotSchema>

export const fleetMissionSnapshotSchema = z.object({
  missionId: z.string().min(1),
  robotId: z.string().min(1),
  mode: opsModeSchema,
  missionType: missionTypeSchema,
  status: missionStatusSchema,
  progress: z.number().min(0).max(100),
  target: waypointSchema,
})
export type FleetMissionSnapshot = z.infer<typeof fleetMissionSnapshotSchema>

export const fleetSnapshotPayloadSchema = z.object({
  mode: opsModeSchema,
  tick: z.number().int().nonnegative(),
  updatedAtTs: z.number().int().nonnegative(),
  robotCount: z.number().int().nonnegative(),
  missionCount: z.number().int().nonnegative(),
  statusSummary: z.object({
    IDLE: z.number().int().nonnegative(),
    ON_MISSION: z.number().int().nonnegative(),
    NEED_ASSIST: z.number().int().nonnegative(),
    FAULT: z.number().int().nonnegative(),
    OFFLINE: z.number().int().nonnegative(),
  }),
  missionTypeSummary: z.object({
    MOVE: z.number().int().nonnegative(),
    BRING: z.number().int().nonnegative(),
    PICK: z.number().int().nonnegative(),
    DELIVERY: z.number().int().nonnegative(),
  }),
  robots: z.array(fleetRobotSnapshotSchema),
  missions: z.array(fleetMissionSnapshotSchema),
})
export type FleetSnapshotPayload = z.infer<typeof fleetSnapshotPayloadSchema>

export const heartbeatPayloadSchema = z.object({
  tick: z.number().int().nonnegative(),
  mode: opsModeSchema,
  connectedClients: z.number().int().nonnegative(),
  runId: z.string().min(1),
  reason: z.string().min(1).optional(),
  replyToClientTs: z.number().int().nonnegative().optional(),
})
export type HeartbeatPayload = z.infer<typeof heartbeatPayloadSchema>

const streamEnvelopeSchema = z.object({
  streamSeq: z.number().int().nonnegative(),
  serverTs: z.number().int().nonnegative(),
})

export const snapshotMessageSchema = streamEnvelopeSchema.extend({
  type: z.literal('snapshot'),
  payload: fleetSnapshotPayloadSchema,
})
export type SnapshotMessage = z.infer<typeof snapshotMessageSchema>

export const telemetryMessageSchema = streamEnvelopeSchema.extend({
  type: z.literal('telemetry'),
  payload: telemetrySchema,
})
export type TelemetryMessage = z.infer<typeof telemetryMessageSchema>

export const eventMessageSchema = streamEnvelopeSchema.extend({
  type: z.literal('event'),
  payload: eventSchema,
})
export type EventMessage = z.infer<typeof eventMessageSchema>

export const incidentMessageSchema = streamEnvelopeSchema.extend({
  type: z.literal('incident'),
  payload: incidentSchema,
})
export type IncidentMessage = z.infer<typeof incidentMessageSchema>

export const heartbeatMessageSchema = streamEnvelopeSchema.extend({
  type: z.literal('heartbeat'),
  payload: heartbeatPayloadSchema,
})
export type HeartbeatMessage = z.infer<typeof heartbeatMessageSchema>

export const wsServerMessageSchema = z.discriminatedUnion('type', [
  snapshotMessageSchema,
  telemetryMessageSchema,
  eventMessageSchema,
  incidentMessageSchema,
  heartbeatMessageSchema,
])
export type WsServerMessage = z.infer<typeof wsServerMessageSchema>

export const pingWsClientMessageSchema = z.object({
  type: z.literal('ping'),
  clientTs: z.number().int().nonnegative().optional(),
})
export type PingWsClientMessage = z.infer<typeof pingWsClientMessageSchema>

export const resumeWsClientMessageSchema = z.object({
  type: z.literal('resume'),
  lastStreamSeq: z.number().int().nonnegative(),
})
export type ResumeWsClientMessage = z.infer<typeof resumeWsClientMessageSchema>

export const setModeWsClientMessageSchema = z.object({
  type: z.literal('set_mode'),
  mode: opsModeSchema,
})
export type SetModeWsClientMessage = z.infer<typeof setModeWsClientMessageSchema>

export const wsClientMessageSchema = z.discriminatedUnion('type', [
  pingWsClientMessageSchema,
  resumeWsClientMessageSchema,
  setModeWsClientMessageSchema,
])
export type WsClientMessage = z.infer<typeof wsClientMessageSchema>
