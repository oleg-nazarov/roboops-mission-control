import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '../appStore'
import { buildEventMessage, buildHeartbeatMessage, buildIncidentMessage, buildSnapshotMessage, buildTelemetryMessage } from '../../test/fixtures/wsMessages'
import { resetAppStore } from '../../test/resetAppStore'

describe('wsStreamSlice', () => {
  beforeEach(() => {
    resetAppStore()
  })

  it('normalizes telemetry into cache/history/trail and deduplicates same timestamp samples', () => {
    const store = useAppStore.getState()

    store.applyWsMessage(
      buildTelemetryMessage({
        streamSeq: 2,
        ts: 1_000,
        x: 10,
        y: 20,
      }),
    )
    store.applyWsMessage(
      buildTelemetryMessage({
        streamSeq: 3,
        ts: 1_000,
        x: 10.5,
        y: 20.2,
      }),
    )
    store.applyWsMessage(
      buildTelemetryMessage({
        streamSeq: 4,
        ts: 1_200,
        x: 11.2,
        y: 20.9,
      }),
    )

    const state = useAppStore.getState()
    const history = state.stream.telemetryHistoryByRobot['RBT-001']
    const trail = state.stream.trailsByRobot['RBT-001']

    expect(history).toHaveLength(2)
    expect(history[0].ts).toBe(1_000)
    expect(history[1].ts).toBe(1_200)
    expect(trail).toHaveLength(3)
    expect(trail[0].x).toBe(10)
    expect(trail[1].x).toBe(10.5)
    expect(trail[2].x).toBe(11.2)
    expect(state.stream.telemetryByRobot['RBT-001'].pose.x).toBe(11.2)
  })

  it('deduplicates event and incident streams by ids', () => {
    const store = useAppStore.getState()

    store.applyWsMessage(
      buildEventMessage({
        streamSeq: 5,
        eventId: 'EVT-001234',
        message: 'First event message',
      }),
    )
    store.applyWsMessage(
      buildEventMessage({
        streamSeq: 6,
        eventId: 'EVT-001234',
        message: 'Duplicate event message',
      }),
    )

    store.applyWsMessage(
      buildIncidentMessage({
        streamSeq: 7,
        incidentId: 'INC-000045',
        message: 'First incident message',
      }),
    )
    store.applyWsMessage(
      buildIncidentMessage({
        streamSeq: 8,
        incidentId: 'INC-000045',
        message: 'Duplicate incident message',
      }),
    )

    const state = useAppStore.getState()
    expect(state.stream.recentEvents).toHaveLength(1)
    expect(state.stream.recentEvents[0].message).toBe('First event message')
    expect(state.stream.recentIncidents).toHaveLength(1)
    expect(state.stream.recentIncidents[0].message).toBe('First incident message')
  })

  it('updates mode and heartbeat metadata from snapshot and heartbeat messages', () => {
    const store = useAppStore.getState()

    store.applyWsMessage(buildSnapshotMessage({ mode: 'WAREHOUSE', streamSeq: 10, tick: 12 }))
    store.applyWsMessage(
      buildHeartbeatMessage({
        streamSeq: 11,
        tick: 13,
        mode: 'WAREHOUSE',
        runId: 'run-task-028',
      }),
    )

    const state = useAppStore.getState()
    expect(state.mode).toBe('warehouse')
    expect(state.ws.lastStreamSeq).toBe(11)
    expect(state.ws.runId).toBe('run-task-028')
    expect(state.ws.lastHeartbeatAtTs).not.toBeNull()
    expect(state.stream.heartbeat?.tick).toBe(13)
  })
})
