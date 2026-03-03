import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../appStore'
import { resetAppStore } from '../../test/resetAppStore'

describe('operatorActionsSlice', () => {
  beforeEach(() => {
    resetAppStore()
    vi.spyOn(Date, 'now').mockReturnValue(25_000)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('handles request assistance and writes local event + toast', () => {
    const store = useAppStore.getState()
    store.requestOperatorAssistance({ robotId: 'RBT-009', missionId: 'MSN-00009' })

    const state = useAppStore.getState()
    expect(state.operatorActions.byRobot['RBT-009'].assistanceRequested).toBe(true)
    expect(state.operatorActions.byRobot['RBT-009'].lastActionLabel).toBe(
      'Operator assistance requested',
    )
    expect(state.stream.recentEvents[0].eventType).toBe('OPERATOR_ASSISTANCE_REQUESTED')
    expect(state.toast.items[0].title).toBe('Operator assistance requested')
  })

  it('toggles pause/resume state with matching events and toasts', () => {
    const store = useAppStore.getState()

    store.toggleRobotMissionPause({ robotId: 'RBT-003', missionId: 'MSN-00003' })
    let state = useAppStore.getState()
    expect(state.operatorActions.byRobot['RBT-003'].missionPaused).toBe(true)
    expect(state.stream.recentEvents[0].eventType).toBe('MISSION_PAUSED_BY_OPERATOR')
    expect(state.toast.items[0].title).toBe('Mission paused')

    store.toggleRobotMissionPause({ robotId: 'RBT-003', missionId: 'MSN-00003' })
    state = useAppStore.getState()
    expect(state.operatorActions.byRobot['RBT-003'].missionPaused).toBe(false)
    expect(state.stream.recentEvents[0].eventType).toBe('MISSION_RESUMED_BY_OPERATOR')
    expect(state.toast.items[0].title).toBe('Mission resumed')
  })

  it('creates local incident with sequence and raises severity when assistance was requested', () => {
    const store = useAppStore.getState()
    store.requestOperatorAssistance({ robotId: 'RBT-021', missionId: 'MSN-00021' })

    const incidentId = store.createIncidentTicket({ robotId: 'RBT-021', missionId: 'MSN-00021' })
    const state = useAppStore.getState()

    expect(incidentId).toBe('INC-LOCAL-000001')
    expect(state.operatorActions.nextLocalIncidentSeq).toBe(2)
    expect(state.stream.recentIncidents[0].incidentId).toBe('INC-LOCAL-000001')
    expect(state.stream.recentIncidents[0].severity).toBe('HIGH')
    expect(state.stream.recentEvents[0].eventType).toBe('MANUAL_INCIDENT_TICKET_CREATED')
    expect(state.toast.items[0].title).toBe('Incident ticket created')
  })
})
