import { create } from 'zustand'
import type {
  Event as OpsEvent,
  FleetSnapshotPayload,
  HeartbeatPayload,
  Incident as OpsIncident,
  OpsMode as ContractOpsMode,
  Telemetry,
  WsServerMessage,
} from '@roboops/contracts'

export type OpsMode = 'delivery' | 'warehouse'
export type FleetStatusFilter = 'FAULT' | 'NEED_ASSIST' | 'OFFLINE'
export type ReplaySpeed = 0.5 | 1 | 2
export type WsConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'

type FleetFiltersState = {
  statusFilters: FleetStatusFilter[]
  searchQuery: string
}

type ReplayState = {
  cursorTs: number
  isPlaying: boolean
  speed: ReplaySpeed
}

type WsState = {
  status: WsConnectionStatus
  url: string
  lastStreamSeq: number
  lastServerTs: number | null
  lastHeartbeatAtTs: number | null
  runId: string | null
  errorMessage: string | null
}

type StreamState = {
  snapshot: FleetSnapshotPayload | null
  telemetryByRobot: Record<string, Telemetry>
  recentEvents: OpsEvent[]
  recentIncidents: OpsIncident[]
  heartbeat: HeartbeatPayload | null
}

type AppStoreState = {
  mode: OpsMode
  selectedRobotId: string | null
  fleetFilters: FleetFiltersState
  replay: ReplayState
  ws: WsState
  stream: StreamState
  setMode: (mode: OpsMode) => void
  setSelectedRobotId: (robotId: string | null) => void
  toggleFleetStatusFilter: (status: FleetStatusFilter) => void
  clearFleetStatusFilters: () => void
  setFleetSearchQuery: (query: string) => void
  setReplayCursorTs: (cursorTs: number) => void
  setReplayPlaying: (isPlaying: boolean) => void
  setReplaySpeed: (speed: ReplaySpeed) => void
  advanceReplayCursor: (deltaTs: number, maxTs: number) => void
  resetReplay: (cursorTs?: number) => void
  setWsStatus: (status: WsConnectionStatus) => void
  setWsUrl: (url: string) => void
  setWsError: (errorMessage: string | null) => void
  applyWsMessage: (message: WsServerMessage) => void
}

const initialReplayState: ReplayState = {
  cursorTs: 0,
  isPlaying: false,
  speed: 1,
}

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
  recentEvents: [],
  recentIncidents: [],
  heartbeat: null,
}

const toAppMode = (mode: ContractOpsMode): OpsMode => (mode === 'DELIVERY' ? 'delivery' : 'warehouse')

export const useAppStore = create<AppStoreState>((set) => ({
  mode: 'delivery',
  selectedRobotId: null,
  fleetFilters: {
    statusFilters: [],
    searchQuery: '',
  },
  replay: initialReplayState,
  ws: initialWsState,
  stream: initialStreamState,

  setMode: (mode) => set({ mode }),

  setSelectedRobotId: (robotId) => set({ selectedRobotId: robotId }),

  toggleFleetStatusFilter: (status) =>
    set((state) => {
      const hasStatus = state.fleetFilters.statusFilters.includes(status)
      return {
        fleetFilters: {
          ...state.fleetFilters,
          statusFilters: hasStatus
            ? state.fleetFilters.statusFilters.filter((item) => item !== status)
            : [...state.fleetFilters.statusFilters, status],
        },
      }
    }),

  clearFleetStatusFilters: () =>
    set((state) => ({
      fleetFilters: {
        ...state.fleetFilters,
        statusFilters: [],
      },
    })),

  setFleetSearchQuery: (query) =>
    set((state) => ({
      fleetFilters: {
        ...state.fleetFilters,
        searchQuery: query,
      },
    })),

  setReplayCursorTs: (cursorTs) =>
    set((state) => ({
      replay: {
        ...state.replay,
        cursorTs: Math.max(0, Math.floor(cursorTs)),
      },
    })),

  setReplayPlaying: (isPlaying) =>
    set((state) => ({
      replay: {
        ...state.replay,
        isPlaying,
      },
    })),

  setReplaySpeed: (speed) =>
    set((state) => ({
      replay: {
        ...state.replay,
        speed,
      },
    })),

  advanceReplayCursor: (deltaTs, maxTs) =>
    set((state) => ({
      replay: {
        ...state.replay,
        cursorTs: Math.min(maxTs, Math.max(0, Math.floor(state.replay.cursorTs + deltaTs))),
      },
    })),

  resetReplay: (cursorTs = 0) =>
    set({
      replay: {
        cursorTs: Math.max(0, Math.floor(cursorTs)),
        isPlaying: false,
        speed: 1,
      },
    }),

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
      }

      if (message.type === 'event') {
        const incomingEventId =
          typeof message.payload.meta?.eventId === 'string'
            ? message.payload.meta.eventId
            : `${message.payload.ts}:${message.payload.robotId}:${message.payload.eventType}:${message.payload.message}`

        const hasEvent = state.stream.recentEvents.some((eventItem) => {
          const existingEventId =
            typeof eventItem.meta?.eventId === 'string'
              ? eventItem.meta.eventId
              : `${eventItem.ts}:${eventItem.robotId}:${eventItem.eventType}:${eventItem.message}`
          return existingEventId === incomingEventId
        })

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
}))
