import { WebSocket, WebSocketServer } from 'ws'
import { z } from 'zod'
import type { Event as OpsEvent, Incident as OpsIncident } from '@roboops/contracts'
import {
  createFleetState,
  getRandomTickDelay,
  summarizeFleetStatuses,
  summarizeMissionTypes,
  switchFleetMode,
  tickFleetState,
} from './fleet.js'

const envSchema = z.object({
  SIM_PORT: z.coerce.number().int().min(1).max(65535).default(8090),
  PING_INTERVAL_MS: z.coerce.number().int().min(250).default(3000),
  SIM_MODE: z.enum(['DELIVERY', 'WAREHOUSE']).default('DELIVERY'),
  MODE_SWITCH_INTERVAL_MS: z.coerce.number().int().min(1000).optional(),
  ROBOT_COUNT: z.coerce.number().int().min(6).max(20).default(12),
  FLEET_TICK_MIN_MS: z.coerce.number().int().min(200).default(200),
  FLEET_TICK_MAX_MS: z.coerce.number().int().min(200).default(500),
  FLEET_LOG_INTERVAL_MS: z.coerce.number().int().min(500).default(5000),
  SIM_EXIT_AFTER_MS: z.coerce.number().int().positive().optional(),
})

const env = envSchema.parse({
  SIM_PORT: process.env.SIM_PORT ?? '8090',
  PING_INTERVAL_MS: process.env.PING_INTERVAL_MS ?? '3000',
  SIM_MODE: process.env.SIM_MODE ?? 'DELIVERY',
  MODE_SWITCH_INTERVAL_MS: process.env.MODE_SWITCH_INTERVAL_MS,
  ROBOT_COUNT: process.env.ROBOT_COUNT ?? '12',
  FLEET_TICK_MIN_MS: process.env.FLEET_TICK_MIN_MS ?? '200',
  FLEET_TICK_MAX_MS: process.env.FLEET_TICK_MAX_MS ?? '500',
  FLEET_LOG_INTERVAL_MS: process.env.FLEET_LOG_INTERVAL_MS ?? '5000',
  SIM_EXIT_AFTER_MS: process.env.SIM_EXIT_AFTER_MS,
})

const pingInboundMessageSchema = z.object({
  type: z.literal('ping'),
  clientTs: z.number().optional(),
})

const setModeInboundMessageSchema = z.object({
  type: z.literal('set_mode'),
  mode: z.enum(['DELIVERY', 'WAREHOUSE']),
})

const inboundMessageSchema = z.discriminatedUnion('type', [
  pingInboundMessageSchema,
  setModeInboundMessageSchema,
])

const connectedMessageSchema = z.object({
  type: z.literal('connected'),
  serverTs: z.number(),
  message: z.string(),
})

const pingMessageSchema = z.object({
  type: z.literal('ping'),
  seq: z.number().int().nonnegative(),
  serverTs: z.number(),
})

const pongMessageSchema = z.object({
  type: z.literal('pong'),
  serverTs: z.number(),
})

const modeChangedMessageSchema = z.object({
  type: z.literal('mode_changed'),
  mode: z.enum(['DELIVERY', 'WAREHOUSE']),
  serverTs: z.number(),
})

type OutboundMessage =
  | z.infer<typeof connectedMessageSchema>
  | z.infer<typeof pingMessageSchema>
  | z.infer<typeof pongMessageSchema>
  | OpsEvent
  | OpsIncident
  | z.infer<typeof modeChangedMessageSchema>

const wss = new WebSocketServer({ port: env.SIM_PORT })
const fleetState = createFleetState(env.ROBOT_COUNT, Date.now(), env.SIM_MODE)
let pingSequence = 0
let fleetTickTimer: NodeJS.Timeout | undefined

const sendJson = (socket: WebSocket, payload: OutboundMessage): void => {
  if (socket.readyState !== WebSocket.OPEN) {
    return
  }

  socket.send(JSON.stringify(payload))
}

const broadcastPing = (): void => {
  const pingEvent = pingMessageSchema.parse({
    type: 'ping',
    seq: pingSequence,
    serverTs: Date.now(),
  })

  for (const client of wss.clients) {
    sendJson(client, pingEvent)
  }

  pingSequence += 1
}

const scheduleFleetTick = (): void => {
  const tickResult = tickFleetState(fleetState, Date.now())

  if (tickResult.events.length > 0 || tickResult.incidents.length > 0) {
    for (const client of wss.clients) {
      for (const event of tickResult.events) {
        sendJson(client, event)
      }

      for (const incident of tickResult.incidents) {
        sendJson(client, incident)
      }
    }

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

  const connectedEvent = connectedMessageSchema.parse({
    type: 'connected',
    serverTs: Date.now(),
    message: 'RoboOps simulator connected',
  })

  sendJson(socket, connectedEvent)
  broadcastPing()

  socket.on('message', (rawMessage) => {
    try {
      const message = JSON.parse(rawMessage.toString()) as unknown
      const parsed = inboundMessageSchema.safeParse(message)

      if (!parsed.success) {
        return
      }

      if (parsed.data.type === 'ping') {
        const pongEvent = pongMessageSchema.parse({
          type: 'pong',
          serverTs: Date.now(),
        })
        sendJson(socket, pongEvent)
        return
      }

      if (parsed.data.type === 'set_mode') {
        const switched = switchFleetMode(fleetState, parsed.data.mode, Date.now())
        if (!switched) {
          return
        }

        const modeChangedEvent = modeChangedMessageSchema.parse({
          type: 'mode_changed',
          mode: fleetState.mode,
          serverTs: Date.now(),
        })

        for (const client of wss.clients) {
          sendJson(client, modeChangedEvent)
        }
      }
    } catch {
      return
    }
  })

  socket.on('close', () => {
    console.log(`[sim] client disconnected: ${remoteAddress}`)
  })
})

const pingTimer = setInterval(broadcastPing, env.PING_INTERVAL_MS)
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
        }
      }, env.MODE_SWITCH_INTERVAL_MS)
scheduleFleetTick()

const shutdown = (signal: string): void => {
  console.log(`[sim] shutdown requested by ${signal}`)
  if (fleetTickTimer) {
    clearTimeout(fleetTickTimer)
  }
  clearInterval(pingTimer)
  clearInterval(fleetLogTimer)
  if (modeSwitchTimer) {
    clearInterval(modeSwitchTimer)
  }
  wss.close(() => {
    console.log('[sim] websocket server closed')
    process.exit(0)
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
console.log(`[sim] ping interval: ${env.PING_INTERVAL_MS}ms`)
console.log(
  `[sim] fleet generator: mode=${fleetState.mode}, robots=${fleetState.robots.length}, ` +
    `tickRange=${env.FLEET_TICK_MIN_MS}-${env.FLEET_TICK_MAX_MS}ms, ` +
    `modeSwitch=${env.MODE_SWITCH_INTERVAL_MS ?? 'disabled'}`,
)
