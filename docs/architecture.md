# RoboOps Mission Control - Architecture

## Main Components

- `apps/web`
  - UI shell and pages (`Fleet`, `Live Map`, `Robot Detail`, `Incidents`, `Replay`)
  - State management (`Zustand`)
  - Replay data fetching (`TanStack Query`)
  - WebSocket stream client
- `apps/sim`
  - Fleet runtime and anomaly simulator
  - WebSocket stream server (`ws`)
  - JSONL run logger
  - Replay API server (reads JSONL and serves normalized incident replay datasets)
- `packages/contracts`
  - Shared `zod` schemas and TypeScript types
  - Runtime payload validation on both producer and consumer paths

## Runtime Data Flow

```mermaid
flowchart LR
  subgraph Simulator["apps/sim"]
    Fleet["Fleet Runtime Tick Loop"]
    WS["WebSocket Stream Server"]
    Logger["Run Logger (JSONL)"]
    Replay["Replay API"]
  end

  subgraph Frontend["apps/web"]
    Client["useOpsWebSocket"]
    Store["Zustand Slices"]
    Screens["Pages + Components"]
    Queries["Replay Queries"]
  end

  Contracts["packages/contracts"]
  Runs["data/runs/*.jsonl"]

  Fleet --> WS
  Fleet --> Logger --> Runs
  Runs --> Replay
  WS --> Client --> Store --> Screens
  Screens --> Queries --> Replay
  Contracts --- WS
  Contracts --- Client
  Contracts --- Replay
```

## Streaming Protocol

Server emits ordered messages:
- `snapshot`: full fleet snapshot and summaries.
- `telemetry`: per-robot stream updates.
- `event`: logs and state changes.
- `incident`: incident entities.
- `heartbeat`: server health, mode, and run metadata.

Unified service routes (Render deployment target):
- WebSocket: `/ws`
- Replay API: `/replay/runs`, `/replay/incidents/:incidentId`
- Health: `/health`

Client behavior:
- validates every payload via shared schema,
- stores `lastStreamSeq` and supports resume flow after reconnect,
- batches message application to reduce UI render pressure.

## Replay Pipeline

```mermaid
sequenceDiagram
  participant Sim as Simulator
  participant Log as JSONL Logger
  participant API as Replay API
  participant Web as Web Replay Page

  Sim->>Log: Append telemetry/event/incident records
  Web->>API: GET /replay/incidents/:incidentId (+lookup hints)
  API->>Log: Scan relevant run JSONL
  API->>API: Build timeline, markers, metrics, trajectory
  API-->>Web: IncidentReplayDataset
  Web->>Web: Scrubber + metrics/map sync
```

## Storage and Contracts

- Log storage: append-only JSONL, one run file per simulator session.
- Shared schema authority: `packages/contracts/src/index.ts`.
- Replay API output model:
  - run metadata (`runId`, `mode`, `startedAtTs`, `endedAtTs`)
  - timeline (`INFO/WARN/ERROR` events)
  - markers (`WARN/ERROR`)
  - trajectory points
  - derived metrics over time

## Reliability and Extension Points

Current reliability features:
- reconnect-safe stream resume via `lastStreamSeq`,
- heartbeat visibility in UI,
- deduplication of repeated events/incidents on the client.
