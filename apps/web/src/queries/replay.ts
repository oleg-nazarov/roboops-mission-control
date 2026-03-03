import { useQuery } from '@tanstack/react-query'
import type { RobotStatus } from '@roboops/contracts'

const DEFAULT_REPLAY_API_URL = 'http://localhost:8091'

const replayApiBaseUrl =
  (typeof import.meta.env.VITE_REPLAY_API_URL === 'string' &&
    import.meta.env.VITE_REPLAY_API_URL.trim()) ||
  DEFAULT_REPLAY_API_URL

export type ReplayRunSummary = {
  runId: string
  startedAtTs: number
  endedAtTs: number
  mode: 'DELIVERY' | 'WAREHOUSE'
  incidents: string[]
}

export type ReplayMetricPoint = {
  ts: number
  battery: number
  speed: number
  localizationConfidence: number
  errors: number
}

export type ReplayEventMarker = {
  ts: number
  level: 'WARN' | 'ERROR'
  label: string
}

export type ReplayTimelineEvent = {
  ts: number
  level: 'INFO' | 'WARN' | 'ERROR'
  eventType: string
  message: string
  robotId: string
  missionId: string | null
}

export type IncidentReplayDataset = {
  incidentId: string
  runId: string
  mode: 'DELIVERY' | 'WAREHOUSE'
  robotId: string
  startedAtTs: number
  endedAtTs: number
  metrics: ReplayMetricPoint[]
  markers: ReplayEventMarker[]
  timeline: ReplayTimelineEvent[]
  trajectory: Array<{
    ts: number
    x: number
    y: number
    heading: number
    status: RobotStatus
  }>
}

type IncidentReplayLookupHints = {
  runId?: string
  robotId?: string
  missionId?: string
  ts?: number
}

const fetchReplayRuns = async (): Promise<ReplayRunSummary[]> => {
  const response = await fetch(`${replayApiBaseUrl}/replay/runs`)
  if (!response.ok) {
    throw new Error(`Replay runs request failed (${response.status})`)
  }

  return (await response.json()) as ReplayRunSummary[]
}

const fetchReplayByIncidentId = async (
  incidentId: string,
  hints?: IncidentReplayLookupHints,
): Promise<IncidentReplayDataset | undefined> => {
  const search = new URLSearchParams()
  if (hints?.runId) {
    search.set('runId', hints.runId)
  }
  if (hints?.robotId) {
    search.set('robotId', hints.robotId)
  }
  if (hints?.missionId) {
    search.set('missionId', hints.missionId)
  }
  if (hints?.ts !== undefined && Number.isFinite(hints.ts)) {
    search.set('ts', String(Math.floor(hints.ts)))
  }

  const query = search.toString()
  const response = await fetch(
    `${replayApiBaseUrl}/replay/incidents/${encodeURIComponent(incidentId)}${query ? `?${query}` : ''}`,
  )

  if (response.status === 404) {
    return undefined
  }

  if (!response.ok) {
    throw new Error(`Incident replay request failed (${response.status})`)
  }

  return (await response.json()) as IncidentReplayDataset
}

export const useReplayRunsQuery = () =>
  useQuery({
    queryKey: ['replay-runs'],
    queryFn: fetchReplayRuns,
    staleTime: 20_000,
  })

export const useIncidentReplayQuery = (
  incidentId: string | undefined,
  hints?: IncidentReplayLookupHints,
) =>
  useQuery({
    queryKey: [
      'incident-replay',
      incidentId,
      hints?.runId ?? null,
      hints?.robotId ?? null,
      hints?.missionId ?? null,
      hints?.ts ?? null,
    ],
    queryFn: () => fetchReplayByIncidentId(incidentId ?? '', hints),
    enabled: Boolean(incidentId),
    staleTime: 20_000,
  })
