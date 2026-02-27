import type { OpsMode as ContractOpsMode } from '@roboops/contracts'
import type { StateCreator } from 'zustand'
import type { AppStoreState, OpsMode, StreamState, WsState, WsStreamSlice } from '../types'

const initialWsState: WsState = {
  status: 'idle',
  url: '',
  lastStreamSeq: 0,
  lastServerTs: null,
  lastHeartbeatAtTs: null,
  runId: null,
  errorMessage: null,
}

const initialStreamState: StreamState = {
  snapshot: null,
  telemetryByRobot: {},
  trailsByRobot: {},
  recentEvents: [],
  recentIncidents: [],
  heartbeat: null,
}

const toAppMode = (mode: ContractOpsMode): OpsMode => (mode === 'DELIVERY' ? 'delivery' : 'warehouse')

const eventIdentity = (input: {
  ts: number
  robotId: string
  eventType: string
  message: string
  meta?: Record<string, unknown>
}): string =>
  typeof input.meta?.eventId === 'string'
    ? input.meta.eventId
    : `${input.ts}:${input.robotId}:${input.eventType}:${input.message}`

export const createWsStreamSlice: StateCreator<AppStoreState, [], [], WsStreamSlice> = (set) => ({
  ws: initialWsState,
  stream: initialStreamState,

  setWsStatus: (status) =>
    set((state) => ({
      ws: {
        ...state.ws,
        status,
      },
    })),

  setWsUrl: (url) =>
    set((state) => ({
      ws: {
        ...state.ws,
        url,
      },
    })),

  setWsError: (errorMessage) =>
    set((state) => ({
      ws: {
        ...state.ws,
        errorMessage,
      },
    })),

  applyWsMessage: (message) =>
    set((state) => {
      const nextWs: WsState = {
        ...state.ws,
        lastStreamSeq: Math.max(state.ws.lastStreamSeq, message.streamSeq),
        lastServerTs: message.serverTs,
        errorMessage: null,
      }

      const nextStream: StreamState = {
        ...state.stream,
      }

      let nextMode = state.mode

      if (message.type === 'snapshot') {
        nextStream.snapshot = message.payload
        nextMode = toAppMode(message.payload.mode)
      }

      if (message.type === 'telemetry') {
        nextStream.telemetryByRobot = {
          ...state.stream.telemetryByRobot,
          [message.payload.robotId]: message.payload,
        }

        const existingTrail = state.stream.trailsByRobot[message.payload.robotId] ?? []
        const lastPoint = existingTrail[existingTrail.length - 1]
        const shouldAppend =
          !lastPoint ||
          lastPoint.ts !== message.payload.ts ||
          lastPoint.x !== message.payload.pose.x ||
          lastPoint.y !== message.payload.pose.y

        if (shouldAppend) {
          const appendedTrail = [
            ...existingTrail,
            {
              ts: message.payload.ts,
              x: message.payload.pose.x,
              y: message.payload.pose.y,
              heading: message.payload.pose.heading,
            },
          ].slice(-24)

          nextStream.trailsByRobot = {
            ...state.stream.trailsByRobot,
            [message.payload.robotId]: appendedTrail,
          }
        }
      }

      if (message.type === 'event') {
        const incomingEventId = eventIdentity(message.payload)
        const hasEvent = state.stream.recentEvents.some(
          (eventItem) => eventIdentity(eventItem) === incomingEventId,
        )

        if (!hasEvent) {
          nextStream.recentEvents = [message.payload, ...state.stream.recentEvents].slice(0, 100)
        }
      }

      if (message.type === 'incident') {
        const hasIncident = state.stream.recentIncidents.some(
          (incident) => incident.incidentId === message.payload.incidentId,
        )
        if (!hasIncident) {
          nextStream.recentIncidents = [message.payload, ...state.stream.recentIncidents].slice(
            0,
            100,
          )
        }
      }

      if (message.type === 'heartbeat') {
        nextStream.heartbeat = message.payload
        nextMode = toAppMode(message.payload.mode)
        nextWs.runId = message.payload.runId
        nextWs.lastHeartbeatAtTs = Date.now()
      }

      return {
        mode: nextMode,
        ws: nextWs,
        stream: nextStream,
      }
    }),
})
