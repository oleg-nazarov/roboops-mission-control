import type { StateCreator } from 'zustand'
import type { AppStoreState, ToastSlice } from '../types'

const TOAST_LIMIT = 6

export const createToastSlice: StateCreator<AppStoreState, [], [], ToastSlice> = (set, get) => ({
  toast: {
    items: [],
    nextToastSeq: 1,
  },

  pushToast: ({ title, description, tone = 'info' }) => {
    const { toast } = get()
    const toastId = `TST-${String(toast.nextToastSeq).padStart(6, '0')}`
    const nextItem = {
      toastId,
      title,
      description,
      tone,
      createdAtTs: Date.now(),
    }

    set((state) => ({
      toast: {
        items: [nextItem, ...state.toast.items].slice(0, TOAST_LIMIT),
        nextToastSeq: state.toast.nextToastSeq + 1,
      },
    }))

    return toastId
  },

  removeToast: (toastId) =>
    set((state) => ({
      toast: {
        ...state.toast,
        items: state.toast.items.filter((item) => item.toastId !== toastId),
      },
    })),

  clearToasts: () =>
    set((state) => ({
      toast: {
        ...state.toast,
        items: [],
      },
    })),
})
