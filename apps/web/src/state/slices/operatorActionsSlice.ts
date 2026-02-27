import type { Event as OpsEvent, Incident as OpsIncident, Severity } from '@roboops/contracts'
import type {
  AppStoreState,
  OperatorActionsSlice,
  OperatorRobotActionState,
} from '../types'
import type { StateCreator } from 'zustand'

const initialOperatorRobotActionState: OperatorRobotActionState = {
  assistanceRequested: false,
  missionPaused: false,
  lastActionLabel: null,
  lastActionTs: null,
}

const initialOperatorActionsState = {
  byRobot: {},
  nextLocalIncidentSeq: 1,
}

const buildLocalIncidentId = (seq: number): string => `INC-LOCAL-${String(seq).padStart(6, '0')}`

const withRobotActionState = (
  byRobot: Record<string, OperatorRobotActionState>,
  robotId: string,
): OperatorRobotActionState => byRobot[robotId] ?? initialOperatorRobotActionState

const buildLocalEvent = (input: {
  ts: number
  robotId: string
  missionId: string | null
  level: 'INFO' | 'WARN' | 'ERROR'
  eventType: string
  message: string
  meta?: Record<string, unknown>
}): OpsEvent => ({
  type: 'event',
  ts: input.ts,
  robotId: input.robotId,
  missionId: input.missionId ?? undefined,
  level: input.level,
  eventType: input.eventType,
  message: input.message,
  meta: {
    source: 'live_map_actions',
    ...input.meta,
  },
})

const buildLocalIncident = (input: {
  ts: number
  incidentId: string
  robotId: string
  missionId: string | null
  severity: Severity
  message: string
}): OpsIncident => ({
  type: 'incident',
  ts: input.ts,
  incidentId: input.incidentId,
  robotId: input.robotId,
  missionId: input.missionId ?? undefined,
  incidentType: 'OBSTACLE_BLOCKED',
  severity: input.severity,
  message: input.message,
  resolved: false,
  meta: {
    source: 'live_map_actions',
    local: true,
  },
})

export const createOperatorActionsSlice: StateCreator<AppStoreState, [], [], OperatorActionsSlice> = (
  set,
) => ({
  operatorActions: initialOperatorActionsState,

  requestOperatorAssistance: ({ robotId, missionId }) =>
    set((state) => {
      const now = Date.now()
      const previous = withRobotActionState(state.operatorActions.byRobot, robotId)
      const nextByRobot = {
        ...state.operatorActions.byRobot,
        [robotId]: {
          ...previous,
          assistanceRequested: true,
          lastActionLabel: 'Operator assistance requested',
          lastActionTs: now,
        },
      }

      const localEvent = buildLocalEvent({
        ts: now,
        robotId,
        missionId,
        level: 'WARN',
        eventType: 'OPERATOR_ASSISTANCE_REQUESTED',
        message: 'Operator assistance requested from live map panel',
      })

      return {
        operatorActions: {
          ...state.operatorActions,
          byRobot: nextByRobot,
        },
        stream: {
          ...state.stream,
          recentEvents: [localEvent, ...state.stream.recentEvents].slice(0, 100),
        },
      }
    }),

  toggleRobotMissionPause: ({ robotId, missionId }) =>
    set((state) => {
      const now = Date.now()
      const previous = withRobotActionState(state.operatorActions.byRobot, robotId)
      const missionPaused = !previous.missionPaused
      const nextByRobot = {
        ...state.operatorActions.byRobot,
        [robotId]: {
          ...previous,
          missionPaused,
          lastActionLabel: missionPaused ? 'Mission paused' : 'Mission resumed',
          lastActionTs: now,
        },
      }

      const localEvent = buildLocalEvent({
        ts: now,
        robotId,
        missionId,
        level: 'INFO',
        eventType: missionPaused ? 'MISSION_PAUSED_BY_OPERATOR' : 'MISSION_RESUMED_BY_OPERATOR',
        message: missionPaused
          ? 'Mission paused by operator from live map panel'
          : 'Mission resumed by operator from live map panel',
      })

      return {
        operatorActions: {
          ...state.operatorActions,
          byRobot: nextByRobot,
        },
        stream: {
          ...state.stream,
          recentEvents: [localEvent, ...state.stream.recentEvents].slice(0, 100),
        },
      }
    }),

  createIncidentTicket: ({ robotId, missionId }) => {
    let createdIncidentId = ''

    set((state) => {
      const now = Date.now()
      const previous = withRobotActionState(state.operatorActions.byRobot, robotId)
      const incidentId = buildLocalIncidentId(state.operatorActions.nextLocalIncidentSeq)
      createdIncidentId = incidentId
      const nextSeq = state.operatorActions.nextLocalIncidentSeq + 1
      const severity: Severity =
        previous.assistanceRequested || previous.missionPaused ? 'HIGH' : 'MEDIUM'
      const incident = buildLocalIncident({
        ts: now,
        incidentId,
        robotId,
        missionId,
        severity,
        message: 'Manual incident ticket created from live map panel',
      })
      const localEvent = buildLocalEvent({
        ts: now,
        robotId,
        missionId,
        level: 'WARN',
        eventType: 'MANUAL_INCIDENT_TICKET_CREATED',
        message: `Manual incident ticket ${incidentId} created`,
        meta: {
          incidentId,
          severity,
        },
      })

      const nextByRobot = {
        ...state.operatorActions.byRobot,
        [robotId]: {
          ...previous,
          lastActionLabel: `Incident ticket created (${incidentId})`,
          lastActionTs: now,
        },
      }

      return {
        operatorActions: {
          byRobot: nextByRobot,
          nextLocalIncidentSeq: nextSeq,
        },
        stream: {
          ...state.stream,
          recentIncidents: [incident, ...state.stream.recentIncidents].slice(0, 100),
          recentEvents: [localEvent, ...state.stream.recentEvents].slice(0, 100),
        },
      }
    })

    return createdIncidentId
  },
})
