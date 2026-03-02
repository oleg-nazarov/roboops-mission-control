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
  telemetryHistoryByRobot: {},
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

type WsMutationDraft = {
  mode: OpsMode
  ws: WsState
  stream: StreamState
}

const applyIncomingWsMessage = (draft: WsMutationDraft, message: Parameters<WsStreamSlice['applyWsMessage']>[0]): void => {
  draft.ws = {
    ...draft.ws,
    lastStreamSeq: Math.max(draft.ws.lastStreamSeq, message.streamSeq),
    lastServerTs: message.serverTs,
    errorMessage: null,
  }

  if (message.type === 'snapshot') {
    draft.stream = {
      ...draft.stream,
      snapshot: message.payload,
    }
    draft.mode = toAppMode(message.payload.mode)
    return
  }

  if (message.type === 'telemetry') {
    const nextTelemetryByRobot = {
      ...draft.stream.telemetryByRobot,
      [message.payload.robotId]: message.payload,
    }

    const existingHistory = draft.stream.telemetryHistoryByRobot[message.payload.robotId] ?? []
    const lastHistoryPoint = existingHistory[existingHistory.length - 1]
    let nextTelemetryHistoryByRobot = draft.stream.telemetryHistoryByRobot
    if (!lastHistoryPoint || lastHistoryPoint.ts !== message.payload.ts) {
      nextTelemetryHistoryByRobot = {
        ...draft.stream.telemetryHistoryByRobot,
        [message.payload.robotId]: [
          ...existingHistory,
          {
            ts: message.payload.ts,
            speed: message.payload.speed,
            battery: message.payload.battery,
            localizationConfidence: message.payload.localizationConfidence,
            temp: message.payload.temp,
          },
        ].slice(-180),
      }
    }

    const existingTrail = draft.stream.trailsByRobot[message.payload.robotId] ?? []
    const lastTrailPoint = existingTrail[existingTrail.length - 1]
    let nextTrailsByRobot = draft.stream.trailsByRobot
    const shouldAppendTrail =
      !lastTrailPoint ||
      lastTrailPoint.ts !== message.payload.ts ||
      lastTrailPoint.x !== message.payload.pose.x ||
      lastTrailPoint.y !== message.payload.pose.y
    if (shouldAppendTrail) {
      nextTrailsByRobot = {
        ...draft.stream.trailsByRobot,
        [message.payload.robotId]: [
          ...existingTrail,
          {
            ts: message.payload.ts,
            x: message.payload.pose.x,
            y: message.payload.pose.y,
            heading: message.payload.pose.heading,
          },
        ].slice(-24),
      }
    }

    draft.stream = {
      ...draft.stream,
      telemetryByRobot: nextTelemetryByRobot,
      telemetryHistoryByRobot: nextTelemetryHistoryByRobot,
      trailsByRobot: nextTrailsByRobot,
    }
    return
  }

  if (message.type === 'event') {
    const incomingEventId = eventIdentity(message.payload)
    const hasEvent = draft.stream.recentEvents.some(
      (eventItem) => eventIdentity(eventItem) === incomingEventId,
    )

    if (!hasEvent) {
      draft.stream = {
        ...draft.stream,
        recentEvents: [message.payload, ...draft.stream.recentEvents].slice(0, 100),
      }
    }
    return
  }

  if (message.type === 'incident') {
    const hasIncident = draft.stream.recentIncidents.some(
      (incident) => incident.incidentId === message.payload.incidentId,
    )

    if (!hasIncident) {
      draft.stream = {
        ...draft.stream,
        recentIncidents: [message.payload, ...draft.stream.recentIncidents].slice(0, 100),
      }
    }
    return
  }

  draft.stream = {
    ...draft.stream,
    heartbeat: message.payload,
  }
  draft.mode = toAppMode(message.payload.mode)
  draft.ws = {
    ...draft.ws,
    runId: message.payload.runId,
    lastHeartbeatAtTs: Date.now(),
  }
}

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

  applyWsMessages: (messages) =>
    set((state) => {
      if (messages.length === 0) {
        return {}
      }

      const draft: WsMutationDraft = {
        mode: state.mode,
        ws: state.ws,
        stream: state.stream,
      }

      for (const message of messages) {
        applyIncomingWsMessage(draft, message)
      }

      return {
        mode: draft.mode,
        ws: draft.ws,
        stream: draft.stream,
      }
    }),

  applyWsMessage: (message) =>
    set((state) => {
      const draft: WsMutationDraft = {
        mode: state.mode,
        ws: state.ws,
        stream: state.stream,
      }

      applyIncomingWsMessage(draft, message)

      return {
        mode: draft.mode,
        ws: draft.ws,
        stream: draft.stream,
      }
    }),
})
