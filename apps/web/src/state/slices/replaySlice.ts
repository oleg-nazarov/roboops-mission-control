import type { StateCreator } from 'zustand'
import type { AppStoreState, ReplaySlice } from '../types'

const initialReplayState = {
  cursorTs: 0,
  isPlaying: false,
  speed: 1 as const,
}

export const createReplaySlice: StateCreator<AppStoreState, [], [], ReplaySlice> = (set) => ({
  replay: initialReplayState,

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
})
