import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const runId = `seed-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`
const outputFile = resolve(process.cwd(), '../../data/runs', `${runId}.jsonl`)

const now = Date.now()
const records = [
  {
    type: 'event',
    ts: now,
    robotId: 'RBT-001',
    missionId: 'MSN-001',
    level: 'INFO',
    eventType: 'SIM_BOOT',
    message: 'Simulator session started',
    meta: { source: 'generate-script' },
  },
  {
    type: 'telemetry',
    ts: now + 500,
    robotId: 'RBT-001',
    pose: { x: 12.4, y: 8.2, heading: 1.03 },
    speed: 1.12,
    battery: 87,
    temp: 38.4,
    localizationConfidence: 0.97,
    sensors: { lidar: 'OK', cam: 'OK', gps: 'OK', imu: 'OK' },
  },
]

const jsonl = records.map((record) => JSON.stringify(record)).join('\n')

await mkdir(dirname(outputFile), { recursive: true })
await writeFile(outputFile, `${jsonl}\n`, 'utf-8')

console.log(`[sim] generated seed run: ${outputFile}`)
