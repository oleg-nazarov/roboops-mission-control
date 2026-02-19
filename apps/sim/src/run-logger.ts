import { mkdirSync, createWriteStream, type WriteStream } from 'node:fs'
import { resolve } from 'node:path'
import {
  eventSchema,
  telemetrySchema,
  type Event as OpsEvent,
  type Telemetry,
} from '@roboops/contracts'

type TelemetryLogLine = {
  runId: string
  lineType: 'telemetry'
  ts: number
  robotId: string
  missionId: string | null
  payload: Telemetry
}

type EventLogLine = {
  runId: string
  lineType: 'event'
  ts: number
  robotId: string
  missionId: string | null
  payload: OpsEvent
}

const makeRunId = (now: Date): string =>
  `run-${now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${now.getMilliseconds().toString().padStart(3, '0')}`

const writeLine = (stream: WriteStream, value: TelemetryLogLine | EventLogLine): void => {
  stream.write(`${JSON.stringify(value)}\n`)
}

export type RunLogger = {
  runId: string
  filePath: string
  logTelemetryBatch: (items: Telemetry[]) => void
  logEventBatch: (items: OpsEvent[]) => void
  close: (onClosed: () => void) => void
}

export const createRunLogger = (): RunLogger => {
  const now = new Date()
  const runId = makeRunId(now)
  const outputDir = resolve(process.cwd(), '../../data/runs')
  const filePath = resolve(outputDir, `${runId}.jsonl`)
  mkdirSync(outputDir, { recursive: true })
  const stream = createWriteStream(filePath, { flags: 'a', encoding: 'utf-8' })

  const logTelemetryBatch = (items: Telemetry[]): void => {
    for (const item of items) {
      const telemetry = telemetrySchema.parse(item)
      writeLine(stream, {
        runId,
        lineType: 'telemetry',
        ts: telemetry.ts,
        robotId: telemetry.robotId,
        missionId: telemetry.missionId ?? null,
        payload: telemetry,
      })
    }
  }

  const logEventBatch = (items: OpsEvent[]): void => {
    for (const item of items) {
      const event = eventSchema.parse(item)
      writeLine(stream, {
        runId,
        lineType: 'event',
        ts: event.ts,
        robotId: event.robotId,
        missionId: event.missionId ?? null,
        payload: event,
      })
    }
  }

  const close = (onClosed: () => void): void => {
    stream.end(onClosed)
  }

  return {
    runId,
    filePath,
    logTelemetryBatch,
    logEventBatch,
    close,
  }
}
