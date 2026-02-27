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

const envSchema = z.object({
  SIM_PORT: z.coerce.number().int().min(1).max(65535).default(8090),
  HEARTBEAT_INTERVAL_MS: z.coerce.number().int().min(250).optional(),
  PING_INTERVAL_MS: z.coerce.number().int().min(250).optional(),
  SIM_MODE: opsModeSchema.default('DELIVERY'),
  MODE_SWITCH_INTERVAL_MS: z.coerce.number().int().min(1000).optional(),
  ROBOT_COUNT: z.coerce.number().int().min(6).max(20).default(12),
  FLEET_TICK_MIN_MS: z.coerce.number().int().min(200).default(200),
  FLEET_TICK_MAX_MS: z.coerce.number().int().min(200).default(500),
  FLEET_LOG_INTERVAL_MS: z.coerce.number().int().min(500).default(5000),
  STREAM_HISTORY_MAX: z.coerce.number().int().min(100).max(50000).default(2000),
  SIM_EXIT_AFTER_MS: z.coerce.number().int().positive().optional(),
})

const env = envSchema.parse({
  SIM_PORT: process.env.SIM_PORT ?? '8090',
  HEARTBEAT_INTERVAL_MS: process.env.HEARTBEAT_INTERVAL_MS,
  PING_INTERVAL_MS: process.env.PING_INTERVAL_MS,
  SIM_MODE: process.env.SIM_MODE ?? 'DELIVERY',
  MODE_SWITCH_INTERVAL_MS: process.env.MODE_SWITCH_INTERVAL_MS,
  ROBOT_COUNT: process.env.ROBOT_COUNT ?? '12',
  FLEET_TICK_MIN_MS: process.env.FLEET_TICK_MIN_MS ?? '200',
  FLEET_TICK_MAX_MS: process.env.FLEET_TICK_MAX_MS ?? '500',
  FLEET_LOG_INTERVAL_MS: process.env.FLEET_LOG_INTERVAL_MS ?? '5000',
  STREAM_HISTORY_MAX: process.env.STREAM_HISTORY_MAX ?? '2000',
  SIM_EXIT_AFTER_MS: process.env.SIM_EXIT_AFTER_MS,
})

const heartbeatIntervalMs = env.HEARTBEAT_INTERVAL_MS ?? env.PING_INTERVAL_MS ?? 3000
type OutboundMessage = WsServerMessage

const wss = new WebSocketServer({ port: env.SIM_PORT })
const fleetState = createFleetState(env.ROBOT_COUNT, Date.now(), env.SIM_MODE)
const runLogger = createRunLogger()
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

  publishSnapshot()

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

const heartbeatTimer = setInterval(() => {
  publishHeartbeat()
}, heartbeatIntervalMs)

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
  clearInterval(fleetLogTimer)
  if (modeSwitchTimer) {
    clearInterval(modeSwitchTimer)
  }
  wss.close(() => {
    runLogger.close(() => {
      console.log('[sim] websocket server closed')
      console.log(`[sim] run log flushed: ${runLogger.filePath}`)
      process.exit(0)
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

console.log(`[sim] ws server listening at ws://localhost:${env.SIM_PORT}`)
console.log(`[sim] heartbeat interval: ${heartbeatIntervalMs}ms`)
console.log(`[sim] run session: ${runLogger.runId}`)
console.log(`[sim] run log file: ${runLogger.filePath}`)
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
