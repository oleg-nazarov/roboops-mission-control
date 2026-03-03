import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '../appStore'
import { resetAppStore } from '../../test/resetAppStore'

describe('replaySlice', () => {
  beforeEach(() => {
    resetAppStore()
  })

  it('sets and clamps cursor values', () => {
    const store = useAppStore.getState()

    store.setReplayCursorTs(1234.99)
    expect(useAppStore.getState().replay.cursorTs).toBe(1234)

    store.setReplayCursorTs(-50)
    expect(useAppStore.getState().replay.cursorTs).toBe(0)
  })

  it('advances cursor and clamps to max range', () => {
    const store = useAppStore.getState()

    store.setReplayCursorTs(1_000)
    store.advanceReplayCursor(250.8, 1_180)
    expect(useAppStore.getState().replay.cursorTs).toBe(1180)

    store.advanceReplayCursor(-5_000, 1_180)
    expect(useAppStore.getState().replay.cursorTs).toBe(0)
  })

  it('resets replay controls to defaults', () => {
    const store = useAppStore.getState()

    store.setReplayCursorTs(8_800)
    store.setReplayPlaying(true)
    store.setReplaySpeed(2)
    store.resetReplay(4_001.3)

    const replay = useAppStore.getState().replay
    expect(replay.cursorTs).toBe(4001)
    expect(replay.isPlaying).toBe(false)
    expect(replay.speed).toBe(1)
  })
})
