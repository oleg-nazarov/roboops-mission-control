import { create } from 'zustand'

export type OpsMode = 'delivery' | 'warehouse'
export type FleetStatusFilter = 'FAULT' | 'NEED_ASSIST' | 'OFFLINE'
export type ReplaySpeed = 0.5 | 1 | 2

type FleetFiltersState = {
  statusFilters: FleetStatusFilter[]
  searchQuery: string
}

type ReplayState = {
  cursorTs: number
  isPlaying: boolean
  speed: ReplaySpeed
}

type AppStoreState = {
  mode: OpsMode
  selectedRobotId: string | null
  fleetFilters: FleetFiltersState
  replay: ReplayState
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
}

const initialReplayState: ReplayState = {
  cursorTs: 0,
  isPlaying: false,
  speed: 1,
}

export const useAppStore = create<AppStoreState>((set) => ({
  mode: 'delivery',
  selectedRobotId: null,
  fleetFilters: {
    statusFilters: [],
    searchQuery: '',
  },
  replay: initialReplayState,

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
}))
