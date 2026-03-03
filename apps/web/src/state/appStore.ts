import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { createFleetFiltersSlice } from './slices/fleetFiltersSlice'
import { createOperatorActionsSlice } from './slices/operatorActionsSlice'
import { createReplaySlice } from './slices/replaySlice'
import { createToastSlice } from './slices/toastSlice'
import { createUiSlice } from './slices/uiSlice'
import { createWsStreamSlice } from './slices/wsStreamSlice'
import type { AppStoreState } from './types'

export type {
  AppStoreState,
  FleetFiltersState,
  FleetFiltersSlice,
  FleetStatusFilter,
  OpsMode,
  OperatorActionsSlice,
  OperatorActionsState,
  OperatorRobotActionState,
  ReplaySlice,
  ReplaySpeed,
  ReplayState,
  StreamState,
  ToastItem,
  ToastSlice,
  ToastState,
  ToastTone,
  UiSlice,
  WsConnectionStatus,
  WsState,
  WsStreamSlice,
} from './types'

export const useAppStore = create<AppStoreState>()(
  persist(
    (...args) => ({
      ...createUiSlice(...args),
      ...createFleetFiltersSlice(...args),
      ...createReplaySlice(...args),
      ...createWsStreamSlice(...args),
      ...createOperatorActionsSlice(...args),
      ...createToastSlice(...args),
    }),
    {
      name: 'roboops-fleet-filters',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        fleetFilters: state.fleetFilters,
      }),
    },
  ),
)
