import { WebSocket, WebSocketServer } from 'ws'
import { z } from 'zod'
import { createFleetState, getRandomTickDelay, summarizeFleetStatuses, tickFleetState } from './fleet.js'

const envSchema = z.object({
  SIM_PORT: z.coerce.number().int().min(1).max(65535).default(8090),
  PING_INTERVAL_MS: z.coerce.number().int().min(250).default(3000),
  ROBOT_COUNT: z.coerce.number().int().min(6).max(20).default(12),
  FLEET_TICK_MIN_MS: z.coerce.number().int().min(200).default(200),
  FLEET_TICK_MAX_MS: z.coerce.number().int().min(200).default(500),
  FLEET_LOG_INTERVAL_MS: z.coerce.number().int().min(500).default(5000),
  SIM_EXIT_AFTER_MS: z.coerce.number().int().positive().optional(),
})

const env = envSchema.parse({
  SIM_PORT: process.env.SIM_PORT ?? '8090',
  PING_INTERVAL_MS: process.env.PING_INTERVAL_MS ?? '3000',
  ROBOT_COUNT: process.env.ROBOT_COUNT ?? '12',
  FLEET_TICK_MIN_MS: process.env.FLEET_TICK_MIN_MS ?? '200',
  FLEET_TICK_MAX_MS: process.env.FLEET_TICK_MAX_MS ?? '500',
  FLEET_LOG_INTERVAL_MS: process.env.FLEET_LOG_INTERVAL_MS ?? '5000',
  SIM_EXIT_AFTER_MS: process.env.SIM_EXIT_AFTER_MS,
})

const inboundMessageSchema = z.object({
  type: z.enum(['ping']),
  clientTs: z.number().optional(),
})

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

type OutboundMessage =
  | z.infer<typeof connectedMessageSchema>
  | z.infer<typeof pingMessageSchema>
  | z.infer<typeof pongMessageSchema>

const wss = new WebSocketServer({ port: env.SIM_PORT })
const fleetState = createFleetState(env.ROBOT_COUNT, Date.now())
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
  tickFleetState(fleetState, Date.now())
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
  console.log(
    `[sim] fleet tick=${fleetState.tick} robots=${fleetState.robots.length} ` +
      `IDLE=${status.IDLE} ON_MISSION=${status.ON_MISSION} NEED_ASSIST=${status.NEED_ASSIST} ` +
      `FAULT=${status.FAULT} OFFLINE=${status.OFFLINE}`,
  )
}, env.FLEET_LOG_INTERVAL_MS)
scheduleFleetTick()

const shutdown = (signal: string): void => {
  console.log(`[sim] shutdown requested by ${signal}`)
  if (fleetTickTimer) {
    clearTimeout(fleetTickTimer)
  }
  clearInterval(pingTimer)
  clearInterval(fleetLogTimer)
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
  `[sim] fleet generator: robots=${fleetState.robots.length}, ` +
    `tickRange=${env.FLEET_TICK_MIN_MS}-${env.FLEET_TICK_MAX_MS}ms`,
)
