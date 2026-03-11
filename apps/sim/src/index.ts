import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, extname, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocket, WebSocketServer, type RawData } from 'ws'
import { z } from 'zod'
import {
  eventSchema,
  heartbeatMessageSchema,
  incidentSchema,
  opsModeSchema,
  snapshotMessageSchema,
  telemetryMessageSchema,
  eventMessageSchema,
  incidentMessageSchema,
  telemetrySchema,
  type Event as OpsEvent,
  type EventMessage,
  type HeartbeatMessage,
  type IncidentMessage,
  type Incident as OpsIncident,
  type OpsMode,
  type SnapshotMessage,
  type Telemetry,
  type TelemetryMessage,
  type WsClientMessage,
  wsClientMessageSchema,
  type WsServerMessage,
} from '@roboops/contracts'
import {
  createFleetSnapshotPayload,
  createFleetState,
  createTelemetrySnapshot,
  getRandomTickDelay,
  summarizeFleetStatuses,
  summarizeMissionTypes,
  switchFleetMode,
  tickFleetState,
} from './fleet.js'
import { createRunLogger } from './run-logger.js'
import { createReplayApiRequestHandler } from './replay-api.js'

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).optional(),
  SIM_PORT: z.coerce.number().int().min(1).max(65535).default(8090),
  REPLAY_SCAN_MAX_FILES: z.coerce.number().int().min(1).max(500).default(8),
  REPLAY_MAX_RUN_FILE_SIZE_MB: z.coerce.number().int().min(1).max(512).default(24),
  HEARTBEAT_INTERVAL_MS: z.coerce.number().int().min(250).optional(),
  PING_INTERVAL_MS: z.coerce.number().int().min(250).optional(),
  SNAPSHOT_INTERVAL_MS: z.coerce.number().int().min(250).default(1000),
  SIM_MODE: opsModeSchema.default('DELIVERY'),
  MODE_SWITCH_INTERVAL_MS: z.coerce.number().int().min(1000).optional(),
  ROBOT_COUNT: z.coerce.number().int().min(6).max(20).default(12),
  FLEET_TICK_MIN_MS: z.coerce.number().int().min(200).default(900),
  FLEET_TICK_MAX_MS: z.coerce.number().int().min(200).default(1100),
  FLEET_LOG_INTERVAL_MS: z.coerce.number().int().min(500).default(5000),
  STREAM_HISTORY_MAX: z.coerce.number().int().min(100).max(50000).default(2000),
  SIM_EXIT_AFTER_MS: z.coerce.number().int().positive().optional(),
})

const env = envSchema.parse({
  PORT: process.env.PORT,
  SIM_PORT: process.env.SIM_PORT ?? '8090',
  REPLAY_SCAN_MAX_FILES: process.env.REPLAY_SCAN_MAX_FILES ?? '8',
  REPLAY_MAX_RUN_FILE_SIZE_MB: process.env.REPLAY_MAX_RUN_FILE_SIZE_MB ?? '24',
  HEARTBEAT_INTERVAL_MS: process.env.HEARTBEAT_INTERVAL_MS,
  PING_INTERVAL_MS: process.env.PING_INTERVAL_MS,
  SNAPSHOT_INTERVAL_MS: process.env.SNAPSHOT_INTERVAL_MS ?? '1000',
  SIM_MODE: process.env.SIM_MODE ?? 'DELIVERY',
  MODE_SWITCH_INTERVAL_MS: process.env.MODE_SWITCH_INTERVAL_MS,
  ROBOT_COUNT: process.env.ROBOT_COUNT ?? '12',
  FLEET_TICK_MIN_MS: process.env.FLEET_TICK_MIN_MS ?? '900',
  FLEET_TICK_MAX_MS: process.env.FLEET_TICK_MAX_MS ?? '1100',
  FLEET_LOG_INTERVAL_MS: process.env.FLEET_LOG_INTERVAL_MS ?? '5000',
  STREAM_HISTORY_MAX: process.env.STREAM_HISTORY_MAX ?? '2000',
  SIM_EXIT_AFTER_MS: process.env.SIM_EXIT_AFTER_MS,
})

const heartbeatIntervalMs = env.HEARTBEAT_INTERVAL_MS ?? env.PING_INTERVAL_MS ?? 3000
const listenPort = env.PORT ?? env.SIM_PORT
type OutboundMessage = WsServerMessage

const simSourceDir = dirname(fileURLToPath(import.meta.url))
const simRootDir = resolve(simSourceDir, '..')
const repoRootDir = resolve(simRootDir, '..', '..')
const runsDir = resolve(repoRootDir, 'data/runs')
const webDistDir = resolve(repoRootDir, 'apps/web/dist')

const hasWebDist = existsSync(resolve(webDistDir, 'index.html'))
const replayRequestHandler = createReplayApiRequestHandler({
  runsDir,
  scanMaxFiles: env.REPLAY_SCAN_MAX_FILES,
  maxRunFileSizeBytes: env.REPLAY_MAX_RUN_FILE_SIZE_MB * 1024 * 1024,
})

const httpServer = createServer()
const wss = new WebSocketServer({ noServer: true })
const fleetState = createFleetState(env.ROBOT_COUNT, Date.now(), env.SIM_MODE)
const runLogger = createRunLogger({
  runsDir,
})
const messageHistory: OutboundMessage[] = []
let streamSequence = 0
let fleetTickTimer: NodeJS.Timeout | undefined
let isShuttingDown = false

const currentStreamSeq = (): number => streamSequence

const nextStreamSeq = (): number => {
  streamSequence += 1
  return streamSequence
}

const pushHistory = (message: OutboundMessage): void => {
  messageHistory.push(message)
  if (messageHistory.length > env.STREAM_HISTORY_MAX) {
    messageHistory.splice(0, messageHistory.length - env.STREAM_HISTORY_MAX)
  }
}

const countConnectedClients = (): number => {
  let count = 0
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      count += 1
    }
  }
  return count
}

const sendJson = (socket: WebSocket, payload: OutboundMessage): void => {
  if (socket.readyState !== WebSocket.OPEN) {
    return
  }

  socket.send(JSON.stringify(payload))
}

const broadcast = (payload: OutboundMessage): void => {
  for (const client of wss.clients) {
    sendJson(client, payload)
  }
}

const publish = (payload: OutboundMessage): void => {
  pushHistory(payload)
  broadcast(payload)
}

const buildSnapshotMessage = (): SnapshotMessage =>
  snapshotMessageSchema.parse({
    type: 'snapshot',
    streamSeq: nextStreamSeq(),
    serverTs: Date.now(),
    payload: createFleetSnapshotPayload(fleetState),
  })

const buildDirectSnapshotMessage = (): SnapshotMessage =>
  snapshotMessageSchema.parse({
    type: 'snapshot',
    streamSeq: currentStreamSeq(),
    serverTs: Date.now(),
    payload: createFleetSnapshotPayload(fleetState),
  })

const buildTelemetryMessage = (telemetry: Telemetry): TelemetryMessage =>
  telemetryMessageSchema.parse({
    type: 'telemetry',
    streamSeq: nextStreamSeq(),
    serverTs: Date.now(),
    payload: telemetrySchema.parse(telemetry),
  })

const buildEventMessage = (event: OpsEvent): EventMessage =>
  eventMessageSchema.parse({
    type: 'event',
    streamSeq: nextStreamSeq(),
    serverTs: Date.now(),
    payload: eventSchema.parse(event),
  })

const buildIncidentMessage = (incident: OpsIncident): IncidentMessage =>
  incidentMessageSchema.parse({
    type: 'incident',
    streamSeq: nextStreamSeq(),
    serverTs: Date.now(),
    payload: incidentSchema.parse(incident),
  })

const buildHeartbeatMessage = (input?: {
  reason?: string
  replyToClientTs?: number
}): HeartbeatMessage =>
  heartbeatMessageSchema.parse({
    type: 'heartbeat',
    streamSeq: nextStreamSeq(),
    serverTs: Date.now(),
    payload: {
      tick: fleetState.tick,
      mode: fleetState.mode,
      connectedClients: countConnectedClients(),
      runId: runLogger.runId,
      reason: input?.reason,
      replyToClientTs: input?.replyToClientTs,
    },
  })

const buildDirectHeartbeatMessage = (input?: {
  reason?: string
  replyToClientTs?: number
}): HeartbeatMessage =>
  heartbeatMessageSchema.parse({
    type: 'heartbeat',
    streamSeq: currentStreamSeq(),
    serverTs: Date.now(),
    payload: {
      tick: fleetState.tick,
      mode: fleetState.mode,
      connectedClients: countConnectedClients(),
      runId: runLogger.runId,
      reason: input?.reason,
      replyToClientTs: input?.replyToClientTs,
    },
  })

const publishSnapshot = (): void => {
  publish(buildSnapshotMessage())
}

const publishTelemetry = (telemetry: Telemetry): void => {
  publish(buildTelemetryMessage(telemetry))
}

const publishEvent = (event: OpsEvent): void => {
  publish(buildEventMessage(event))
}

const publishIncident = (incident: OpsIncident): void => {
  publish(buildIncidentMessage(incident))
}

const publishHeartbeat = (input?: {
  reason?: string
  replyToClientTs?: number
}): void => {
  publish(buildHeartbeatMessage(input))
}

const buildSystemEvent = (
  eventType: string,
  message: string,
  meta: Record<string, unknown> = {},
): OpsEvent =>
  eventSchema.parse({
    type: 'event',
    ts: Date.now(),
    robotId: 'SIM',
    level: 'INFO',
    eventType,
    message,
    meta: {
      mode: fleetState.mode,
      ...meta,
    },
  })

const publishSystemEvent = (event: OpsEvent): void => {
  runLogger.logEventBatch([event])
  publishEvent(event)
}

const toText = (rawMessage: RawData): string => {
  if (typeof rawMessage === 'string') {
    return rawMessage
  }

  if (Array.isArray(rawMessage)) {
    return Buffer.concat(rawMessage).toString('utf-8')
  }

  if (rawMessage instanceof ArrayBuffer) {
    return Buffer.from(rawMessage).toString('utf-8')
  }

  return rawMessage.toString()
}

const tryParseInboundMessage = (
  rawMessage: RawData,
): WsClientMessage | undefined => {
  try {
    const parsed = JSON.parse(toText(rawMessage)) as unknown
    const message = wsClientMessageSchema.safeParse(parsed)
    if (!message.success) {
      return undefined
    }
    return message.data
  } catch {
    return undefined
  }
}

const replayFrom = (socket: WebSocket, lastStreamSeq: number): void => {
  if (messageHistory.length === 0) {
    sendJson(socket, buildDirectSnapshotMessage())
    sendJson(socket, buildDirectHeartbeatMessage({ reason: 'resume-empty-history' }))
    return
  }

  const oldestSeq = messageHistory[0].streamSeq
  const newestSeq = messageHistory[messageHistory.length - 1].streamSeq

  if (lastStreamSeq < oldestSeq - 1 || lastStreamSeq > newestSeq) {
    sendJson(socket, buildDirectSnapshotMessage())
    sendJson(socket, buildDirectHeartbeatMessage({ reason: 'resume-out-of-range' }))
    return
  }

  let replayCount = 0
  for (const message of messageHistory) {
    if (message.streamSeq > lastStreamSeq) {
      sendJson(socket, message)
      replayCount += 1
    }
  }

  if (replayCount === 0) {
    sendJson(socket, buildDirectHeartbeatMessage({ reason: 'resume-no-gap' }))
  }
}

const scheduleFleetTick = (): void => {
  const tickResult = tickFleetState(fleetState, Date.now())
  const telemetryBatch = createTelemetrySnapshot(fleetState)

  runLogger.logTelemetryBatch(telemetryBatch)
  runLogger.logEventBatch(tickResult.events)

  for (const telemetry of telemetryBatch) {
    publishTelemetry(telemetry)
  }

  for (const event of tickResult.events) {
    publishEvent(event)
  }

  for (const incident of tickResult.incidents) {
    publishIncident(incident)
  }

  if (tickResult.events.length > 0 || tickResult.incidents.length > 0) {
    console.log(
      `[sim] anomaly burst events=${tickResult.events.length} incidents=${tickResult.incidents.length}`,
    )
  }

  fleetTickTimer = setTimeout(
    scheduleFleetTick,
    getRandomTickDelay(env.FLEET_TICK_MIN_MS, env.FLEET_TICK_MAX_MS),
  )
}

const contentTypeByExtension: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
}

const sendJsonResponse = (statusCode: number, payload: Record<string, unknown>): string =>
  JSON.stringify({
    statusCode,
    ...payload,
  })

const resolveStaticPath = (pathname: string): string | null => {
  const requestedPath = pathname === '/' ? '/index.html' : pathname
  const normalizedPath = normalize(requestedPath).replace(/^(\.\.(\/|\\|$))+/, '')
  const filePath = resolve(webDistDir, `.${normalizedPath}`)
  if (!filePath.startsWith(webDistDir)) {
    return null
  }

  return filePath
}

const serveStaticAsset = async (pathname: string): Promise<{
  statusCode: number
  body: Buffer
  contentType: string
} | null> => {
  if (!hasWebDist) {
    return null
  }

  const directPath = resolveStaticPath(pathname)
  if (directPath) {
    try {
      const body = await readFile(directPath)
      const extension = extname(directPath).toLowerCase()
      return {
        statusCode: 200,
        body,
        contentType: contentTypeByExtension[extension] ?? 'application/octet-stream',
      }
    } catch {
      // Fallback to index.html for SPA routes.
    }
  }

  try {
    const body = await readFile(resolve(webDistDir, 'index.html'))
    return {
      statusCode: 200,
      body,
      contentType: contentTypeByExtension['.html'],
    }
  } catch {
    return null
  }
}

httpServer.on('request', async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
  const pathname = url.pathname

  if (pathname === '/health') {
    response.statusCode = 200
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.end(
      sendJsonResponse(200, {
        status: 'ok',
        wsClients: countConnectedClients(),
        runId: runLogger.runId,
      }),
    )
    return
  }

  const replayHandled = await replayRequestHandler(request, response)
  if (replayHandled) {
    return
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.statusCode = 405
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.end(sendJsonResponse(405, { error: 'Method not allowed' }))
    return
  }

  const asset = await serveStaticAsset(pathname)
  if (asset) {
    response.statusCode = asset.statusCode
    response.setHeader('Content-Type', asset.contentType)
    if (pathname.startsWith('/assets/')) {
      response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    } else {
      response.setHeader('Cache-Control', 'no-cache')
    }

    if (request.method === 'HEAD') {
      response.end()
      return
    }

    response.end(asset.body)
    return
  }

  response.statusCode = 404
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(sendJsonResponse(404, { error: 'Not found' }))
})

httpServer.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
  if (url.pathname !== '/ws' && url.pathname !== '/') {
    socket.destroy()
    return
  }

  wss.handleUpgrade(request, socket, head, (wsSocket) => {
    wss.emit('connection', wsSocket, request)
  })
})

wss.on('connection', (socket, request) => {
  const remoteAddress = request.socket.remoteAddress ?? 'unknown'
  console.log(`[sim] client connected from ${remoteAddress}`)

  sendJson(socket, buildDirectSnapshotMessage())
  sendJson(socket, buildDirectHeartbeatMessage({ reason: 'connected' }))

  socket.on('message', (rawMessage) => {
    const message = tryParseInboundMessage(rawMessage)
    if (!message) {
      return
    }

    if (message.type === 'ping') {
      sendJson(
        socket,
        buildDirectHeartbeatMessage({
          reason: 'ping',
          replyToClientTs: message.clientTs,
        }),
      )
      return
    }

    if (message.type === 'resume') {
      replayFrom(socket, message.lastStreamSeq)
      return
    }

    const switched = switchFleetMode(fleetState, message.mode, Date.now())
    if (!switched) {
      return
    }

    publishSystemEvent(
      buildSystemEvent('MODE_SWITCH', `Simulation mode switched to ${fleetState.mode}`, {
        requestedBy: 'ws_client',
      }),
    )
    publishSnapshot()
  })

  socket.on('close', () => {
    console.log(`[sim] client disconnected: ${remoteAddress}`)
  })
})

httpServer.listen(listenPort, () => {
  console.log(`[sim] service listening at http://localhost:${listenPort}`)
})

const heartbeatTimer = setInterval(() => {
  publishHeartbeat()
}, heartbeatIntervalMs)

const snapshotTimer = setInterval(() => {
  publishSnapshot()
}, env.SNAPSHOT_INTERVAL_MS)

const fleetLogTimer = setInterval(() => {
  const status = summarizeFleetStatuses(fleetState)
  const missionTypes = summarizeMissionTypes(fleetState)
  console.log(
    `[sim] fleet tick=${fleetState.tick} mode=${fleetState.mode} robots=${fleetState.robots.length} ` +
      `IDLE=${status.IDLE} ON_MISSION=${status.ON_MISSION} NEED_ASSIST=${status.NEED_ASSIST} ` +
      `FAULT=${status.FAULT} OFFLINE=${status.OFFLINE} ` +
      `missions: DELIVERY=${missionTypes.DELIVERY} MOVE=${missionTypes.MOVE} BRING=${missionTypes.BRING} PICK=${missionTypes.PICK}`,
  )
}, env.FLEET_LOG_INTERVAL_MS)

const modeSwitchTimer =
  env.MODE_SWITCH_INTERVAL_MS === undefined
    ? undefined
    : setInterval(() => {
        const nextMode = fleetState.mode === 'DELIVERY' ? 'WAREHOUSE' : 'DELIVERY'
        const switched = switchFleetMode(fleetState, nextMode, Date.now())
        if (switched) {
          console.log(`[sim] mode switched to ${fleetState.mode}`)
          publishSystemEvent(
            buildSystemEvent('MODE_SWITCH', `Simulation mode switched to ${fleetState.mode}`, {
              requestedBy: 'auto_timer',
            }),
          )
          publishSnapshot()
        }
      }, env.MODE_SWITCH_INTERVAL_MS)

scheduleFleetTick()

const shutdown = (signal: string): void => {
  if (isShuttingDown) {
    return
  }
  isShuttingDown = true

  console.log(`[sim] shutdown requested by ${signal}`)
  if (fleetTickTimer) {
    clearTimeout(fleetTickTimer)
  }
  clearInterval(heartbeatTimer)
  clearInterval(snapshotTimer)
  clearInterval(fleetLogTimer)
  if (modeSwitchTimer) {
    clearInterval(modeSwitchTimer)
  }

  for (const client of wss.clients) {
    client.close(1001, 'server shutdown')
  }

  wss.close(() => {
    httpServer.close(() => {
      runLogger.close(() => {
        console.log('[sim] websocket server closed')
        console.log('[sim] http server closed')
        console.log(`[sim] run log flushed: ${runLogger.filePath}`)
        process.exit(0)
      })
    })
  })

  setTimeout(() => {
    process.exit(1)
  }, 2000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

if (env.SIM_EXIT_AFTER_MS) {
  setTimeout(() => shutdown('SIM_EXIT_AFTER_MS'), env.SIM_EXIT_AFTER_MS).unref()
}

console.log(
  `[sim] endpoints: ws://localhost:${listenPort}/ws | http://localhost:${listenPort}/replay/runs`,
)
console.log(
  `[sim] replay index settings: scanMaxFiles=${env.REPLAY_SCAN_MAX_FILES} maxRunFileSizeMB=${env.REPLAY_MAX_RUN_FILE_SIZE_MB}`,
)
console.log(`[sim] heartbeat interval: ${heartbeatIntervalMs}ms`)
console.log(`[sim] snapshot interval: ${env.SNAPSHOT_INTERVAL_MS}ms`)
console.log(`[sim] run session: ${runLogger.runId}`)
console.log(`[sim] run log file: ${runLogger.filePath}`)
console.log(`[sim] runs dir: ${runsDir}`)
console.log(
  `[sim] static frontend: ${
    hasWebDist ? `enabled (${webDistDir})` : `disabled (build web first: ${webDistDir})`
  }`,
)
console.log(
  `[sim] fleet generator: mode=${fleetState.mode}, robots=${fleetState.robots.length}, ` +
    `tickRange=${env.FLEET_TICK_MIN_MS}-${env.FLEET_TICK_MAX_MS}ms, ` +
    `modeSwitch=${env.MODE_SWITCH_INTERVAL_MS ?? 'disabled'}, history=${env.STREAM_HISTORY_MAX}`,
)

publishSystemEvent(
  buildSystemEvent('SIM_RUN_STARTED', 'Simulator run session started', {
    runId: runLogger.runId,
    robotCount: fleetState.robots.length,
  }),
)
publishSnapshot()
publishHeartbeat({ reason: 'session-started' })

