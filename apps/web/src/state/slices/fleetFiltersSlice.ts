import type { StateCreator } from 'zustand'
import type { AppStoreState, FleetFiltersSlice } from '../types'

const initialFleetFilters = {
  statusFilters: [],
  searchQuery: '',
}

export const createFleetFiltersSlice: StateCreator<AppStoreState, [], [], FleetFiltersSlice> = (
  set,
) => ({
  fleetFilters: initialFleetFilters,

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
})
