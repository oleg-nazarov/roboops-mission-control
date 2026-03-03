import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { IncidentsPage } from './IncidentsPage'
import { resetAppStore } from '../test/resetAppStore'
import { useAppStore } from '../state/appStore'
import { buildIncidentMessage } from '../test/fixtures/wsMessages'

const seedIncidents = (): void => {
  const store = useAppStore.getState()
  store.setWsStatus('connected')
  store.applyWsMessage(
    buildIncidentMessage({
      incidentId: 'INC-100001',
      robotId: 'RBT-001',
      incidentType: 'STUCK',
      severity: 'MEDIUM',
      ts: 10_000,
    }),
  )
  store.applyWsMessage(
    buildIncidentMessage({
      incidentId: 'INC-100002',
      robotId: 'RBT-002',
      incidentType: 'SENSOR_FAIL',
      severity: 'CRITICAL',
      ts: 11_000,
    }),
  )
  store.applyWsMessage(
    buildIncidentMessage({
      incidentId: 'INC-100003',
      robotId: 'RBT-002',
      incidentType: 'OBSTACLE_BLOCKED',
      severity: 'HIGH',
      ts: 12_000,
    }),
  )
}

describe('IncidentsPage', () => {
  beforeEach(() => {
    resetAppStore()
  })

  it('shows waiting state when stream is connected and incidents have not arrived yet', () => {
    useAppStore.getState().setWsStatus('connected')
    render(
      <MemoryRouter>
        <IncidentsPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Waiting for incident stream data...')).toBeInTheDocument()
  })

  it('filters incidents by type/severity/robot and clears filters', async () => {
    const user = userEvent.setup()
    seedIncidents()

    render(
      <MemoryRouter>
        <IncidentsPage />
      </MemoryRouter>,
    )

    const table = screen.getByRole('table')
    expect(within(table).getByText('INC-100001')).toBeInTheDocument()
    expect(within(table).getByText('INC-100002')).toBeInTheDocument()
    expect(within(table).getByText('INC-100003')).toBeInTheDocument()

    const [typeSelect, severitySelect, robotSelect] = screen.getAllByRole('combobox')
    await user.selectOptions(typeSelect, 'OBSTACLE_BLOCKED')
    await user.selectOptions(severitySelect, 'HIGH')
    await user.selectOptions(robotSelect, 'RBT-002')

    expect(within(table).getByText('INC-100003')).toBeInTheDocument()
    expect(within(table).queryByText('INC-100001')).not.toBeInTheDocument()
    expect(within(table).queryByText('INC-100002')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(within(table).getByText('INC-100001')).toBeInTheDocument()
    expect(within(table).getByText('INC-100002')).toBeInTheDocument()
    expect(within(table).getByText('INC-100003')).toBeInTheDocument()
  })
})
