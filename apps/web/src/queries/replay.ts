import { useQuery } from '@tanstack/react-query'
import {
  incidentReplayByIdMock,
  replayRunsMock,
  type IncidentReplayDataset,
  type ReplayRunSummary,
} from '../data/replayMock'

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

const fetchReplayRuns = async (): Promise<ReplayRunSummary[]> => {
  await wait(120)
  return replayRunsMock
}

const fetchReplayByIncidentId = async (
  incidentId: string,
): Promise<IncidentReplayDataset | undefined> => {
  await wait(160)
  return incidentReplayByIdMock[incidentId]
}

export const useReplayRunsQuery = () =>
  useQuery({
    queryKey: ['replay-runs'],
    queryFn: fetchReplayRuns,
    staleTime: 20_000,
  })

export const useIncidentReplayQuery = (incidentId: string | undefined) =>
  useQuery({
    queryKey: ['incident-replay', incidentId],
    queryFn: () => fetchReplayByIncidentId(incidentId ?? ''),
    enabled: Boolean(incidentId),
    staleTime: 20_000,
  })
