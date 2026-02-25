import type {
  Event as OpsEvent,
  FleetSnapshotPayload,
  HeartbeatPayload,
  Incident as OpsIncident,
  Telemetry,
  WsServerMessage,
} from '@roboops/contracts'

export type OpsMode = 'delivery' | 'warehouse'
export type FleetStatusFilter = 'FAULT' | 'NEED_ASSIST' | 'OFFLINE'
export type ReplaySpeed = 0.5 | 1 | 2
export type WsConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'

export type FleetFiltersState = {
  statusFilters: FleetStatusFilter[]
  searchQuery: string
}

export type ReplayState = {
  cursorTs: number
  isPlaying: boolean
  speed: ReplaySpeed
}

export type WsState = {
  status: WsConnectionStatus
  url: string
  lastStreamSeq: number
  lastServerTs: number | null
  lastHeartbeatAtTs: number | null
  runId: string | null
  errorMessage: string | null
}

export type StreamState = {
  snapshot: FleetSnapshotPayload | null
  telemetryByRobot: Record<string, Telemetry>
  recentEvents: OpsEvent[]
  recentIncidents: OpsIncident[]
  heartbeat: HeartbeatPayload | null
}

export type UiSlice = {
  mode: OpsMode
  selectedRobotId: string | null
  setMode: (mode: OpsMode) => void
  setSelectedRobotId: (robotId: string | null) => void
}

export type FleetFiltersSlice = {
  fleetFilters: FleetFiltersState
  toggleFleetStatusFilter: (status: FleetStatusFilter) => void
  clearFleetStatusFilters: () => void
  setFleetSearchQuery: (query: string) => void
}

export type ReplaySlice = {
  replay: ReplayState
  setReplayCursorTs: (cursorTs: number) => void
  setReplayPlaying: (isPlaying: boolean) => void
  setReplaySpeed: (speed: ReplaySpeed) => void
  advanceReplayCursor: (deltaTs: number, maxTs: number) => void
  resetReplay: (cursorTs?: number) => void
}

export type WsStreamSlice = {
  ws: WsState
  stream: StreamState
  setWsStatus: (status: WsConnectionStatus) => void
  setWsUrl: (url: string) => void
  setWsError: (errorMessage: string | null) => void
  applyWsMessage: (message: WsServerMessage) => void
}

export type AppStoreState = UiSlice & FleetFiltersSlice & ReplaySlice & WsStreamSlice
