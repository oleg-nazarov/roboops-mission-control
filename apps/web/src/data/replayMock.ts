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

export type IncidentReplayDataset = {
  incidentId: string
  runId: string
  robotId: string
  startedAtTs: number
  endedAtTs: number
  metrics: ReplayMetricPoint[]
  markers: ReplayEventMarker[]
}

const baseTs = 1_761_490_000_000

export const replayRunsMock: ReplayRunSummary[] = [
  {
    runId: 'run-20260219141000-101',
    startedAtTs: baseTs,
    endedAtTs: baseTs + 120_000,
    mode: 'DELIVERY',
    incidents: ['INC-000001', 'INC-000002'],
  },
  {
    runId: 'run-20260219142500-305',
    startedAtTs: baseTs + 180_000,
    endedAtTs: baseTs + 320_000,
    mode: 'WAREHOUSE',
    incidents: ['INC-000101'],
  },
]

const incidentReplayRecords: Record<string, IncidentReplayDataset> = {
  'INC-000001': {
    incidentId: 'INC-000001',
    runId: 'run-20260219141000-101',
    robotId: 'RBT-001',
    startedAtTs: baseTs + 10_000,
    endedAtTs: baseTs + 70_000,
    metrics: [
      { ts: baseTs + 10_000, battery: 92, speed: 1.2, localizationConfidence: 0.96, errors: 0 },
      { ts: baseTs + 20_000, battery: 90, speed: 1.4, localizationConfidence: 0.93, errors: 0 },
      { ts: baseTs + 30_000, battery: 88, speed: 1.3, localizationConfidence: 0.88, errors: 1 },
      { ts: baseTs + 40_000, battery: 86, speed: 0.4, localizationConfidence: 0.44, errors: 2 },
      { ts: baseTs + 50_000, battery: 85, speed: 0.0, localizationConfidence: 0.31, errors: 2 },
      { ts: baseTs + 60_000, battery: 84, speed: 0.2, localizationConfidence: 0.58, errors: 2 },
      { ts: baseTs + 70_000, battery: 83, speed: 0.9, localizationConfidence: 0.81, errors: 2 },
    ],
    markers: [
      { ts: baseTs + 31_000, level: 'WARN', label: 'Confidence decline started' },
      { ts: baseTs + 40_000, level: 'ERROR', label: 'Localization dropout' },
      { ts: baseTs + 49_000, level: 'WARN', label: 'Operator assist requested' },
    ],
  },
  'INC-000002': {
    incidentId: 'INC-000002',
    runId: 'run-20260219141000-101',
    robotId: 'RBT-007',
    startedAtTs: baseTs + 35_000,
    endedAtTs: baseTs + 95_000,
    metrics: [
      { ts: baseTs + 35_000, battery: 76, speed: 1.0, localizationConfidence: 0.94, errors: 0 },
      { ts: baseTs + 47_000, battery: 74, speed: 0.8, localizationConfidence: 0.91, errors: 0 },
      { ts: baseTs + 58_000, battery: 72, speed: 0.2, localizationConfidence: 0.89, errors: 1 },
      { ts: baseTs + 70_000, battery: 70, speed: 0.0, localizationConfidence: 0.85, errors: 2 },
      { ts: baseTs + 82_000, battery: 68, speed: 0.3, localizationConfidence: 0.86, errors: 2 },
      { ts: baseTs + 95_000, battery: 66, speed: 0.7, localizationConfidence: 0.9, errors: 2 },
    ],
    markers: [
      { ts: baseTs + 58_000, level: 'WARN', label: 'Obstacle blocked path' },
      { ts: baseTs + 70_000, level: 'ERROR', label: 'Robot stuck alert' },
    ],
  },
  'INC-000101': {
    incidentId: 'INC-000101',
    runId: 'run-20260219142500-305',
    robotId: 'RBT-012',
    startedAtTs: baseTs + 190_000,
    endedAtTs: baseTs + 255_000,
    metrics: [
      { ts: baseTs + 190_000, battery: 68, speed: 0.9, localizationConfidence: 0.98, errors: 0 },
      { ts: baseTs + 205_000, battery: 67, speed: 1.1, localizationConfidence: 0.96, errors: 0 },
      { ts: baseTs + 218_000, battery: 65, speed: 0.3, localizationConfidence: 0.95, errors: 1 },
      { ts: baseTs + 231_000, battery: 64, speed: 0.0, localizationConfidence: 0.9, errors: 2 },
      { ts: baseTs + 244_000, battery: 63, speed: 0.0, localizationConfidence: 0.84, errors: 3 },
      { ts: baseTs + 255_000, battery: 62, speed: 0.4, localizationConfidence: 0.88, errors: 3 },
    ],
    markers: [
      { ts: baseTs + 218_000, level: 'WARN', label: 'Lidar degradation warning' },
      { ts: baseTs + 244_000, level: 'ERROR', label: 'Sensor fail incident' },
    ],
  },
}

export const incidentReplayByIdMock = incidentReplayRecords
