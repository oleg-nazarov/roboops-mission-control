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
