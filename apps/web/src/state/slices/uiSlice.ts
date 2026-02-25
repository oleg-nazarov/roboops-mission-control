import type { StateCreator } from 'zustand'
import type { AppStoreState, UiSlice } from '../types'

export const createUiSlice: StateCreator<AppStoreState, [], [], UiSlice> = (set) => ({
  mode: 'delivery',
  selectedRobotId: null,
  setMode: (mode) => set({ mode }),
  setSelectedRobotId: (robotId) => set({ selectedRobotId: robotId }),
})
