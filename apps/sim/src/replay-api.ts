import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import {
  eventSchema,
  incidentSchema,
  opsRecordSchema,
  telemetrySchema,
  type Event as OpsEvent,
  type Incident as OpsIncident,
  type OpsMode,
  type Telemetry,
} from '@roboops/contracts'

type ReplayRunSummary = {
  runId: string
  startedAtTs: number
  endedAtTs: number
  mode: OpsMode
  incidents: string[]
}

type ReplayMetricPoint = {
  ts: number
  battery: number
  speed: number
  localizationConfidence: number
  errors: number
}

type ReplayEventMarker = {
  ts: number
  level: 'WARN' | 'ERROR'
  label: string
}

type ReplayTimelineEvent = {
  ts: number
  level: OpsEvent['level']
  eventType: string
  message: string
  robotId: string
  missionId: string | null
}

type IncidentReplayDataset = {
  incidentId: string
  runId: string
  robotId: string
  startedAtTs: number
  endedAtTs: number
  metrics: ReplayMetricPoint[]
  markers: ReplayEventMarker[]
  timeline: ReplayTimelineEvent[]
}

type ReplayEventRef = {
  runId: string
  ts: number
  robotId: string
  missionId: string | null
  eventType: string
  message: string
  level: 'WARN' | 'ERROR'
  eventId: string | null
}

type ReplayIncidentRef = {
  runId: string
  ts: number
  robotId: string
  missionId: string | null
  incidentId: string
}

type ReplayRunIndexEntry = {
  runId: string
  filePath: string
  startedAtTs: number
  endedAtTs: number
  mode: OpsMode
  incidents: Set<string>
  events: ReplayEventRef[]
  incidentRefs: ReplayIncidentRef[]
}

type ReplayIndex = {
  runs: ReplayRunIndexEntry[]
  runById: Map<string, ReplayRunIndexEntry>
  eventById: Map<string, ReplayEventRef>
  incidentById: Map<string, ReplayIncidentRef>
}

type ReplayLookupHints = {
  robotId?: string
  missionId?: string
  ts?: number
}

type ParsedLine = {
  ts: number
  mode: OpsMode | null
  telemetry: Telemetry | null
  event: OpsEvent | null
  incident: OpsIncident | null
}

type ReplayApiOptions = {
  port: number
  runsDir: string
  scanMaxFiles: number
  maxRunFileSizeBytes: number
}

const isWarnOrErrorLevel = (level: OpsEvent['level']): level is 'WARN' | 'ERROR' =>
  level === 'WARN' || level === 'ERROR'

const isWarnOrErrorTimelineEvent = (
  eventItem: ReplayTimelineEvent,
): eventItem is ReplayTimelineEvent & { level: 'WARN' | 'ERROR' } =>
  isWarnOrErrorLevel(eventItem.level)

const INDEX_CACHE_TTL_MS = 10_000
const REPLAY_WINDOW_BEFORE_MS = 30_000
const REPLAY_WINDOW_AFTER_MS = 90_000
const MAX_INCIDENTS_PER_RUN_SUMMARY = 120

const okJson = (response: ServerResponse, statusCode: number, payload: unknown): void => {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.end(JSON.stringify(payload))
}

const parseJsonLine = (line: string): ParsedLine | null => {
  const trimmed = line.trim()
  if (!trimmed) {
    return null
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown
    const directRecord = opsRecordSchema.safeParse(parsed)
    if (directRecord.success) {
      const record = directRecord.data
      if (record.type === 'telemetry') {
        return {
          ts: record.ts,
          mode: record.mode ?? null,
          telemetry: record,
          event: null,
          incident: null,
        }
      }
      if (record.type === 'event') {
        return {
          ts: record.ts,
          mode: null,
          telemetry: null,
          event: record,
          incident: null,
        }
      }
      if (record.type === 'incident') {
        return {
          ts: record.ts,
          mode: null,
          telemetry: null,
          event: null,
          incident: record,
        }
      }

      return {
        ts: record.ts,
        mode: record.mode ?? null,
        telemetry: null,
        event: null,
        incident: null,
      }
    }

    if (typeof parsed !== 'object' || parsed === null || !('payload' in parsed)) {
      return null
    }

    const payload = (parsed as { payload: unknown }).payload
    const telemetryPayload = telemetrySchema.safeParse(payload)
    if (telemetryPayload.success) {
      return {
        ts: telemetryPayload.data.ts,
        mode: telemetryPayload.data.mode ?? null,
        telemetry: telemetryPayload.data,
        event: null,
        incident: null,
      }
    }

    const eventPayload = eventSchema.safeParse(payload)
    if (eventPayload.success) {
      return {
        ts: eventPayload.data.ts,
        mode: null,
        telemetry: null,
        event: eventPayload.data,
        incident: null,
      }
    }

    const incidentPayload = incidentSchema.safeParse(payload)
    if (incidentPayload.success) {
      return {
        ts: incidentPayload.data.ts,
        mode: null,
        telemetry: null,
        event: null,
        incident: incidentPayload.data,
      }
    }
  } catch {
    return null
  }

  return null
}

const toIncidentIdFromEventId = (eventId: string): string | null => {
  const match = /^EVT-(\d{6})$/.exec(eventId)
  if (!match) {
    return null
  }
  return `INC-${match[1]}`
}

const toEventIdFromIncidentId = (incidentId: string): string | null => {
  const match = /^INC-(\d{6})$/.exec(incidentId)
  if (!match) {
    return null
  }
  return `EVT-${match[1]}`
}

const parseRunFileIndex = async (input: {
  filePath: string
  runId: string
}): Promise<ReplayRunIndexEntry | null> => {
  let startedAtTs = Number.POSITIVE_INFINITY
  let endedAtTs = 0
  const incidents = new Set<string>()
  const events: ReplayEventRef[] = []
  const incidentRefs: ReplayIncidentRef[] = []
  const modeCounts: Partial<Record<OpsMode, number>> = {}

  const lineReader = createInterface({
    input: createReadStream(input.filePath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  })

  for await (const line of lineReader) {
    const parsed = parseJsonLine(line)
    if (!parsed) {
      continue
    }

    startedAtTs = Math.min(startedAtTs, parsed.ts)
    endedAtTs = Math.max(endedAtTs, parsed.ts)

    if (parsed.mode) {
      modeCounts[parsed.mode] = (modeCounts[parsed.mode] ?? 0) + 1
    }

    if (parsed.incident) {
      incidents.add(parsed.incident.incidentId)
      incidentRefs.push({
        runId: input.runId,
        ts: parsed.incident.ts,
        robotId: parsed.incident.robotId,
        missionId: parsed.incident.missionId ?? null,
        incidentId: parsed.incident.incidentId,
      })
      continue
    }

    if (!parsed.event || (parsed.event.level !== 'WARN' && parsed.event.level !== 'ERROR')) {
      continue
    }

    const eventId = typeof parsed.event.meta.eventId === 'string' ? parsed.event.meta.eventId : null
    if (eventId) {
      const mappedIncidentId = toIncidentIdFromEventId(eventId)
      if (mappedIncidentId) {
        incidents.add(mappedIncidentId)
      }
    }

    events.push({
      runId: input.runId,
      ts: parsed.event.ts,
      robotId: parsed.event.robotId,
      missionId: parsed.event.missionId ?? null,
      eventType: parsed.event.eventType,
      message: parsed.event.message,
      level: parsed.event.level,
      eventId,
    })
  }

  if (!Number.isFinite(startedAtTs) || endedAtTs === 0) {
    return null
  }

  const mode: OpsMode =
    (modeCounts.DELIVERY ?? 0) >= (modeCounts.WAREHOUSE ?? 0) ? 'DELIVERY' : 'WAREHOUSE'

  return {
    runId: input.runId,
    filePath: input.filePath,
    startedAtTs,
    endedAtTs,
    mode,
    incidents,
    events,
    incidentRefs,
  }
}

const makeFingerprint = async (runsDir: string): Promise<string> => {
  const entries = await readdir(runsDir, { withFileTypes: true })
  const files = entries.filter((entry) => entry.isFile() && extname(entry.name) === '.jsonl')
  const parts: string[] = []
  for (const file of files) {
    const filePath = resolve(runsDir, file.name)
    const stats = await stat(filePath)
    parts.push(`${file.name}:${stats.size}:${stats.mtimeMs}`)
  }
  parts.sort((left, right) => left.localeCompare(right))
  return parts.join('|')
}

const buildReplayIndex = async (
  runsDir: string,
  scanMaxFiles: number,
  maxRunFileSizeBytes: number,
): Promise<ReplayIndex> => {
  const entries = await readdir(runsDir, { withFileTypes: true })
  const files = entries
    .filter((entry) => entry.isFile() && extname(entry.name) === '.jsonl')
    .map((entry) => resolve(runsDir, entry.name))

  const filesWithStats = await Promise.all(
    files.map(async (filePath) => ({
      filePath,
      stats: await stat(filePath),
    })),
  )

  filesWithStats.sort((left, right) => right.stats.mtimeMs - left.stats.mtimeMs)
  const allowedBySize = filesWithStats.filter(
    (file) => file.stats.size <= Math.max(1, maxRunFileSizeBytes),
  )
  const selectedPool =
    allowedBySize.length > 0
      ? allowedBySize
      : [...filesWithStats].sort((left, right) => left.stats.size - right.stats.size)
  const selected = selectedPool.slice(0, Math.max(1, scanMaxFiles))

  const runs: ReplayRunIndexEntry[] = []
  for (const file of selected) {
    const runId = basename(file.filePath, '.jsonl')
    const parsed = await parseRunFileIndex({
      filePath: file.filePath,
      runId,
    })
    if (parsed) {
      runs.push(parsed)
    }
  }

  runs.sort((left, right) => right.endedAtTs - left.endedAtTs)

  const runById = new Map<string, ReplayRunIndexEntry>()
  const eventById = new Map<string, ReplayEventRef>()
  const incidentById = new Map<string, ReplayIncidentRef>()
  for (const run of runs) {
    runById.set(run.runId, run)
    for (const incidentRef of run.incidentRefs) {
      incidentById.set(incidentRef.incidentId, incidentRef)
    }
    for (const eventRef of run.events) {
      if (eventRef.eventId) {
        eventById.set(eventRef.eventId, eventRef)
      }
    }
  }

  return {
    runs,
    runById,
    eventById,
    incidentById,
  }
}

const closestEventRefByHints = (index: ReplayIndex, hints: ReplayLookupHints): ReplayEventRef | null => {
  if (!hints.robotId || hints.ts === undefined || !Number.isFinite(hints.ts)) {
    return null
  }

  let best: ReplayEventRef | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const run of index.runs) {
    for (const eventRef of run.events) {
      if (eventRef.robotId !== hints.robotId) {
        continue
      }
      if (hints.missionId && eventRef.missionId && eventRef.missionId !== hints.missionId) {
        continue
      }

      const distance = Math.abs(eventRef.ts - hints.ts)
      if (distance < bestDistance) {
        bestDistance = distance
        best = eventRef
      }
    }
  }

  if (bestDistance > 15_000) {
    return null
  }
  return best
}

const resolveIncidentRef = (
  index: ReplayIndex,
  incidentId: string,
  hints: ReplayLookupHints,
): { runId: string; ts: number; robotId: string; missionId: string | null } | null => {
  const explicit = index.incidentById.get(incidentId)
  if (explicit) {
    return explicit
  }

  const mappedEventId = toEventIdFromIncidentId(incidentId)
  if (mappedEventId) {
    const mappedEvent = index.eventById.get(mappedEventId)
    if (mappedEvent) {
      return {
        runId: mappedEvent.runId,
        ts: mappedEvent.ts,
        robotId: mappedEvent.robotId,
        missionId: mappedEvent.missionId,
      }
    }
  }

  const closest = closestEventRefByHints(index, hints)
  if (!closest) {
    return null
  }

  return {
    runId: closest.runId,
    ts: closest.ts,
    robotId: closest.robotId,
    missionId: closest.missionId,
  }
}

const buildReplayForIncident = async (input: {
  run: ReplayRunIndexEntry
  incidentId: string
  robotId: string
  missionId: string | null
  ts: number
}): Promise<IncidentReplayDataset | null> => {
  const startedWindowTs = Math.max(input.run.startedAtTs, input.ts - REPLAY_WINDOW_BEFORE_MS)
  const endedWindowTs = Math.min(input.run.endedAtTs, input.ts + REPLAY_WINDOW_AFTER_MS)
  const telemetryByTs = new Map<number, Telemetry>()
  const timeline: ReplayTimelineEvent[] = []

  const lineReader = createInterface({
    input: createReadStream(input.run.filePath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  })

  for await (const line of lineReader) {
    const parsed = parseJsonLine(line)
    if (!parsed || parsed.ts < startedWindowTs || parsed.ts > endedWindowTs) {
      continue
    }

    if (parsed.telemetry && parsed.telemetry.robotId === input.robotId) {
      telemetryByTs.set(parsed.telemetry.ts, parsed.telemetry)
      continue
    }

    if (!parsed.event || parsed.event.robotId !== input.robotId) {
      continue
    }

    if (input.missionId && parsed.event.missionId && parsed.event.missionId !== input.missionId) {
      continue
    }

    timeline.push({
      ts: parsed.event.ts,
      level: parsed.event.level,
      eventType: parsed.event.eventType,
      message: parsed.event.message,
      robotId: parsed.event.robotId,
      missionId: parsed.event.missionId ?? null,
    })
  }

  const sortedTimeline = timeline.sort((left, right) => left.ts - right.ts)
  const markers = sortedTimeline
    .filter(isWarnOrErrorTimelineEvent)
    .map((eventItem) => ({
      ts: eventItem.ts,
      level: eventItem.level,
      label: `${eventItem.eventType}: ${eventItem.message}`,
    }))

  const sortedTelemetry = [...telemetryByTs.values()].sort((left, right) => left.ts - right.ts)
  if (sortedTelemetry.length === 0) {
    return null
  }

  let markerCursor = 0
  let errors = 0
  const metrics: ReplayMetricPoint[] = []
  for (const telemetry of sortedTelemetry) {
    while (markerCursor < markers.length && markers[markerCursor].ts <= telemetry.ts) {
      if (markers[markerCursor].level === 'ERROR') {
        errors += 1
      }
      markerCursor += 1
    }

    metrics.push({
      ts: telemetry.ts,
      battery: telemetry.battery,
      speed: telemetry.speed,
      localizationConfidence: telemetry.localizationConfidence,
      errors,
    })
  }

  return {
    incidentId: input.incidentId,
    runId: input.run.runId,
    robotId: input.robotId,
    startedAtTs: sortedTelemetry[0].ts,
    endedAtTs: sortedTelemetry[sortedTelemetry.length - 1].ts,
    metrics,
    markers,
    timeline: sortedTimeline,
  }
}

export const startReplayApiServer = (options: ReplayApiOptions): { close: (callback: () => void) => void } => {
  let cache:
    | {
        createdAtTs: number
        fingerprint: string
        index: ReplayIndex
      }
    | undefined

  const getIndex = async (): Promise<ReplayIndex> => {
    const now = Date.now()
    const fingerprint = await makeFingerprint(options.runsDir)
    if (
      cache &&
      cache.fingerprint === fingerprint &&
      now - cache.createdAtTs <= INDEX_CACHE_TTL_MS
    ) {
      return cache.index
    }

    const index = await buildReplayIndex(
      options.runsDir,
      options.scanMaxFiles,
      options.maxRunFileSizeBytes,
    )
    cache = {
      createdAtTs: now,
      fingerprint,
      index,
    }
    return index
  }

  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    response.setHeader('Access-Control-Allow-Origin', '*')
    response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (request.method === 'OPTIONS') {
      response.statusCode = 204
      response.end()
      return
    }

    if (request.method !== 'GET') {
      okJson(response, 405, {
        error: 'Method not allowed',
      })
      return
    }

    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
    if (url.pathname === '/replay/runs') {
      try {
        const index = await getIndex()
        const payload: ReplayRunSummary[] = index.runs.map((run) => ({
          runId: run.runId,
          startedAtTs: run.startedAtTs,
          endedAtTs: run.endedAtTs,
          mode: run.mode,
          incidents: [...run.incidents]
            .sort((left, right) => left.localeCompare(right))
            .slice(0, MAX_INCIDENTS_PER_RUN_SUMMARY),
        }))
        okJson(response, 200, payload)
      } catch (error) {
        okJson(response, 500, {
          error: 'Failed to parse replay runs',
          details: error instanceof Error ? error.message : 'unknown',
        })
      }
      return
    }

    const incidentMatch = /^\/replay\/incidents\/([^/]+)$/.exec(url.pathname)
    if (!incidentMatch) {
      okJson(response, 404, {
        error: 'Not found',
      })
      return
    }

    const incidentId = decodeURIComponent(incidentMatch[1])
    const hints: ReplayLookupHints = {
      robotId: url.searchParams.get('robotId') ?? undefined,
      missionId: url.searchParams.get('missionId') ?? undefined,
      ts:
        url.searchParams.get('ts') !== null
          ? Number(url.searchParams.get('ts'))
          : undefined,
    }

    try {
      const index = await getIndex()
      const ref = resolveIncidentRef(index, incidentId, hints)
      if (!ref) {
        okJson(response, 404, {
          error: 'Replay dataset not found for incident',
          incidentId,
        })
        return
      }

      const run = index.runById.get(ref.runId)
      if (!run) {
        okJson(response, 404, {
          error: 'Run file not found for incident',
          incidentId,
          runId: ref.runId,
        })
        return
      }

      const dataset = await buildReplayForIncident({
        run,
        incidentId,
        robotId: ref.robotId,
        missionId: ref.missionId,
        ts: ref.ts,
      })
      if (!dataset) {
        okJson(response, 404, {
          error: 'Replay dataset has no telemetry in selected window',
          incidentId,
          runId: run.runId,
        })
        return
      }

      okJson(response, 200, dataset)
    } catch (error) {
      okJson(response, 500, {
        error: 'Failed to build replay dataset',
        details: error instanceof Error ? error.message : 'unknown',
      })
    }
  })

  server.listen(options.port, () => {
    console.log(`[sim] replay api listening at http://localhost:${options.port}`)
    console.log(
      `[sim] replay api source: runsDir=${options.runsDir}, scanMaxFiles=${options.scanMaxFiles}, ` +
        `maxRunFileSizeBytes=${options.maxRunFileSizeBytes}`,
    )
  })

  return {
    close: (callback) => {
      server.close(callback)
    },
  }
}
