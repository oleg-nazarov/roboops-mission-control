import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { useAppStore } from '../state/appStore'
import { buildFleetMissionSnapshot, buildFleetRobotSnapshot, buildSnapshotMessage } from '../test/fixtures/wsMessages'
import { resetAppStore } from '../test/resetAppStore'
import { FleetPage } from './FleetPage'

const seedFleetSnapshot = (): void => {
  const store = useAppStore.getState()
  store.setWsStatus('connected')
  store.applyWsMessage(
    buildSnapshotMessage({
      mode: 'DELIVERY',
      streamSeq: 1,
      robots: [
        buildFleetRobotSnapshot({
          robotId: 'RBT-001',
          status: 'FAULT',
          missionId: 'MSN-001',
          missionProgress: 10,
        }),
        buildFleetRobotSnapshot({
          robotId: 'RBT-002',
          status: 'ON_MISSION',
          missionId: 'MSN-002',
          missionProgress: 44.2,
        }),
        buildFleetRobotSnapshot({
          robotId: 'RBT-003',
          status: 'OFFLINE',
        }),
      ],
      missions: [
        buildFleetMissionSnapshot({ missionId: 'MSN-001', robotId: 'RBT-001', progress: 10 }),
        buildFleetMissionSnapshot({ missionId: 'MSN-002', robotId: 'RBT-002', progress: 44.2 }),
      ],
    }),
  )
}

describe('FleetPage', () => {
  beforeEach(() => {
    resetAppStore()
    seedFleetSnapshot()
  })

  it('filters rows by status chips and by robot search query', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <FleetPage />
      </MemoryRouter>,
    )

    const table = screen.getByRole('table')
    expect(within(table).getByText('RBT-001')).toBeInTheDocument()
    expect(within(table).getByText('RBT-002')).toBeInTheDocument()
    expect(within(table).getByText('RBT-003')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'FAULT' }))
    expect(within(table).getByText('RBT-001')).toBeInTheDocument()
    expect(within(table).queryByText('RBT-002')).not.toBeInTheDocument()
    expect(within(table).queryByText('RBT-003')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear Filters' }))
    const search = screen.getByRole('textbox', { name: /search by robot id/i })
    await user.clear(search)
    await user.type(search, 'RBT-003')

    expect(within(table).getByText('RBT-003')).toBeInTheDocument()
    expect(within(table).queryByText('RBT-001')).not.toBeInTheDocument()
    expect(within(table).queryByText('RBT-002')).not.toBeInTheDocument()
  })
})
