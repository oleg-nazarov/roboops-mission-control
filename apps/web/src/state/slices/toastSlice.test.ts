import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../appStore'
import { resetAppStore } from '../../test/resetAppStore'

describe('toastSlice', () => {
  beforeEach(() => {
    resetAppStore()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates deterministic toast ids and keeps only the latest six items', () => {
    vi.spyOn(Date, 'now').mockReturnValue(10_000)
    const store = useAppStore.getState()

    const firstToastId = store.pushToast({ title: 'first' })
    for (let index = 0; index < 7; index += 1) {
      store.pushToast({ title: `toast-${index}` })
    }

    const state = useAppStore.getState()
    expect(firstToastId).toBe('TST-000001')
    expect(state.toast.nextToastSeq).toBe(9)
    expect(state.toast.items).toHaveLength(6)
    expect(state.toast.items[0].title).toBe('toast-6')
    expect(state.toast.items[state.toast.items.length - 1].title).toBe('toast-1')
  })

  it('removes one toast and clears all toasts', () => {
    const store = useAppStore.getState()

    const idA = store.pushToast({ title: 'a' })
    const idB = store.pushToast({ title: 'b' })
    store.removeToast(idA)

    let state = useAppStore.getState()
    expect(state.toast.items.map((item) => item.toastId)).toEqual([idB])

    store.clearToasts()
    state = useAppStore.getState()
    expect(state.toast.items).toEqual([])
  })
})
