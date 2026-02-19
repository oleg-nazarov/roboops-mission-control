import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  eventSchema,
  incidentSchema,
  missionSchema,
  opsRecordSchema,
  telemetrySchema,
} from '@roboops/contracts'

const runId = `seed-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`
const outputFile = resolve(process.cwd(), '../../data/runs', `${runId}.jsonl`)

const now = Date.now()
const records = [
  eventSchema.parse({
    type: 'event',
    ts: now,
    robotId: 'RBT-001',
    missionId: 'MSN-001',
    level: 'INFO',
    eventType: 'SIM_BOOT',
    message: 'Simulator session started',
    meta: { source: 'generate-script' },
  }),
  telemetrySchema.parse({
    type: 'telemetry',
    ts: now + 500,
    robotId: 'RBT-001',
    mode: 'DELIVERY',
    status: 'ON_MISSION',
    missionId: 'MSN-001',
    pose: { x: 12.4, y: 8.2, heading: 1.03 },
    speed: 1.12,
    battery: 87,
    temp: 38.4,
    localizationConfidence: 0.97,
    sensors: { lidar: 'OK', cam: 'OK', gps: 'OK', imu: 'OK' },
  }),
  missionSchema.parse({
    type: 'mission',
    ts: now + 750,
    missionId: 'MSN-001',
    robotId: 'RBT-001',
    mode: 'DELIVERY',
    missionType: 'DELIVERY',
    waypoints: [
      { x: 8.5, y: 6.1 },
      { x: 12.4, y: 8.2 },
    ],
    target: { x: 12.4, y: 8.2 },
    status: 'ACTIVE',
    progress: 42,
  }),
  incidentSchema.parse({
    type: 'incident',
    ts: now + 1200,
    incidentId: 'INC-001',
    robotId: 'RBT-001',
    missionId: 'MSN-001',
    incidentType: 'OBSTACLE_BLOCKED',
    severity: 'MEDIUM',
    message: 'Temporary obstacle detected on route',
    resolved: false,
    meta: { source: 'generate-script' },
  }),
]

const validatedRecords = records.map((record) => opsRecordSchema.parse(record))
const jsonl = validatedRecords.map((record) => JSON.stringify(record)).join('\n')

await mkdir(dirname(outputFile), { recursive: true })
await writeFile(outputFile, `${jsonl}\n`, 'utf-8')

console.log(`[sim] generated seed run: ${outputFile}`)
