import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { resetAppStore } from '../test/resetAppStore'
import { IncidentReplayPage } from './IncidentReplayPage'
import { useIncidentReplayQuery } from '../queries/replay'

vi.mock('../queries/replay', () => ({
  useIncidentReplayQuery: vi.fn(),
}))

vi.mock('./replay/ReplaySceneCanvas', () => ({
  ReplaySceneCanvas: () => <div data-testid="replay-scene-canvas" />,
}))

const replayDataset = {
  incidentId: 'INC-000777',
  runId: 'run-777',
  mode: 'DELIVERY' as const,
  robotId: 'RBT-007',
  startedAtTs: 1_000,
  endedAtTs: 3_000,
  metrics: [
    { ts: 1_000, battery: 92, speed: 0.5, localizationConfidence: 0.96, errors: 0 },
    { ts: 2_000, battery: 74, speed: 1.5, localizationConfidence: 0.7, errors: 1 },
    { ts: 3_000, battery: 55, speed: 2.75, localizationConfidence: 0.41, errors: 3 },
  ],
  markers: [
    { ts: 2_000, level: 'WARN' as const, label: 'Obstacle blocked' },
    { ts: 2_800, level: 'ERROR' as const, label: 'Localization dropout' },
  ],
  timeline: [
    {
      ts: 1_500,
      level: 'INFO' as const,
      eventType: 'MISSION_STARTED',
      message: 'Mission started',
      robotId: 'RBT-007',
      missionId: 'MSN-077',
    },
    {
      ts: 2_800,
      level: 'ERROR' as const,
      eventType: 'LOCALIZATION_DROPOUT',
      message: 'Localization confidence dropped',
      robotId: 'RBT-007',
      missionId: 'MSN-077',
    },
  ],
  trajectory: [
    { ts: 1_000, x: 10, y: 10, heading: 0.1, status: 'ON_MISSION' as const },
    { ts: 2_000, x: 20, y: 15, heading: 0.2, status: 'NEED_ASSIST' as const },
    { ts: 3_000, x: 28, y: 20, heading: 0.4, status: 'FAULT' as const },
  ],
}

describe('IncidentReplayPage', () => {
  beforeEach(() => {
    resetAppStore()
    vi.mocked(useIncidentReplayQuery).mockReturnValue({
      isLoading: false,
      isError: false,
      data: replayDataset,
    } as ReturnType<typeof useIncidentReplayQuery>)
  })

  it('keeps scrubber, progress and metric cards synchronized', async () => {
    render(
      <MemoryRouter initialEntries={['/incidents/INC-000777/replay']}>
        <Routes>
          <Route element={<IncidentReplayPage />} path="/incidents/:incidentId/replay" />
        </Routes>
      </MemoryRouter>,
    )

    const slider = await screen.findByRole('slider')
    await waitFor(() => {
      expect((slider as HTMLInputElement).value).toBe('1000')
    })

    fireEvent.change(slider, { target: { value: '3000' } })

    await waitFor(() => {
      expect(screen.getByText(/Progress:/)).toHaveTextContent('100.0%')
    })
    expect(screen.getByText('55%')).toBeInTheDocument()
    expect(screen.getByText('2.75 m/s')).toBeInTheDocument()
    expect(screen.getByText('0.41')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('toggles play state with Space shortcut and ignores Space on range input', async () => {
    render(
      <MemoryRouter initialEntries={['/incidents/INC-000777/replay']}>
        <Routes>
          <Route element={<IncidentReplayPage />} path="/incidents/:incidentId/replay" />
        </Routes>
      </MemoryRouter>,
    )

    const playButton = await screen.findByRole('button', { name: 'Play' })
    expect(playButton).toBeInTheDocument()

    fireEvent.keyDown(window, { code: 'Space', key: ' ' })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    })

    const slider = screen.getByRole('slider')
    fireEvent.keyDown(slider, { code: 'Space', key: ' ' })
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
  })
})
