import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '../appStore'
import { resetAppStore } from '../../test/resetAppStore'

describe('fleetFiltersSlice', () => {
  beforeEach(() => {
    resetAppStore()
  })

  it('toggles status filters and clears them', () => {
    const store = useAppStore.getState()

    store.toggleFleetStatusFilter('FAULT')
    store.toggleFleetStatusFilter('OFFLINE')
    let state = useAppStore.getState()

    expect(state.fleetFilters.statusFilters).toEqual(['FAULT', 'OFFLINE'])

    store.toggleFleetStatusFilter('FAULT')
    state = useAppStore.getState()
    expect(state.fleetFilters.statusFilters).toEqual(['OFFLINE'])

    store.clearFleetStatusFilters()
    state = useAppStore.getState()
    expect(state.fleetFilters.statusFilters).toEqual([])
  })

  it('stores search query', () => {
    const store = useAppStore.getState()
    store.setFleetSearchQuery('RBT-017')

    expect(useAppStore.getState().fleetFilters.searchQuery).toBe('RBT-017')
  })
})
