import { create } from 'zustand'
import { createFleetFiltersSlice } from './slices/fleetFiltersSlice'
import { createReplaySlice } from './slices/replaySlice'
import { createUiSlice } from './slices/uiSlice'
import { createWsStreamSlice } from './slices/wsStreamSlice'
import type { AppStoreState } from './types'

export type {
  AppStoreState,
  FleetFiltersState,
  FleetFiltersSlice,
  FleetStatusFilter,
  OpsMode,
  ReplaySlice,
  ReplaySpeed,
  ReplayState,
  StreamState,
  UiSlice,
  WsConnectionStatus,
  WsState,
  WsStreamSlice,
} from './types'

export const useAppStore = create<AppStoreState>()((...args) => ({
  ...createUiSlice(...args),
  ...createFleetFiltersSlice(...args),
  ...createReplaySlice(...args),
  ...createWsStreamSlice(...args),
}))
