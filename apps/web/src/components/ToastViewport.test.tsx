import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastViewport } from './ToastViewport'
import { useAppStore } from '../state/appStore'
import { resetAppStore } from '../test/resetAppStore'

describe('ToastViewport', () => {
  beforeEach(() => {
    resetAppStore()
    vi.useFakeTimers()
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders toasts and auto-dismisses by TTL', () => {
    const store = useAppStore.getState()
    store.pushToast({ title: 'Mission paused', tone: 'info' })

    render(<ToastViewport />)
    expect(screen.getByText('Mission paused')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(4_100)
    })

    expect(screen.queryByText('Mission paused')).not.toBeInTheDocument()
  })
})
