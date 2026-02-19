# RoboOps Mission Control - ROADMAP

This roadmap breaks the MVP into small sequential tasks so each task can be reviewed and committed independently.
Quality bar: this MVP should be production-like, polished, and visually strong, not a simplified demo.

## Phase 0 - Project Bootstrap

### Task 001 - Initialize repository structure
- [x] Create base folders:
  - [x] `apps/web` (React frontend)
  - [x] `apps/sim` (Node simulator + WebSocket server)
  - [x] `data` (JSONL logs and mock fixtures)
  - [x] `docs` (diagrams, screenshots, notes)
- [x] Add repository files:
  - [x] `.gitignore`
  - [x] `README.md` (draft)
  - [x] `docs/ROADMAP.md`

### Task 002 - Setup frontend app (React + TS + Vite)
- [x] Initialize Vite React TypeScript app in `apps/web`
- [x] Configure npm scripts (`dev`, `build`, `preview`, `lint`)
- [x] Verify dev server starts successfully

### Task 003 - Install core frontend libraries
- [x] Install:
  - [x] `react-router-dom`
  - [x] `@tanstack/react-query`
  - [x] `zustand`
  - [x] `recharts`
  - [x] `clsx`
  - [x] `zod`
- [x] Map strategy (dual-render):
  - [x] `maplibre-gl` for Delivery Rover Ops
  - [x] SVG floorplan renderer for Warehouse AMR Ops

### Task 004 - Setup styling/UI foundation
- [x] Styling approach selected: `Tailwind CSS + CSS variables` (default stack)
- [x] Install and configure Tailwind in `apps/web`
- [x] Configure Tailwind content paths and base theme extension
- [x] Define design tokens:
  - [x] semantic colors (bg/surface/text/border)
  - [x] status colors (`IDLE`, `ON_MISSION`, `NEED_ASSIST`, `FAULT`, `OFFLINE`)
  - [x] spacing and radii scale
  - [x] typography scale
  - [x] motion/easing tokens
- [x] Implement tokens as CSS variables in global stylesheet
- [x] Wire Tailwind theme values to CSS variables
- [x] Add mode-level theme switch hooks (Delivery/Warehouse) via root data attributes
- [x] Build app shell:
  - [x] top bar (mode switch)
  - [x] sidebar navigation
  - [x] content container
- [x] Ensure token compatibility with MapLibre overlays and SVG floorplan renderer
- [x] Establish polished visual language (strong typography, layered backgrounds, purposeful motion)

### Task 005 - Setup backend simulator app (Node + ws)
- [x] Initialize `apps/sim` (Node + TypeScript)
- [x] Install dependencies:
  - [x] `ws`
  - [x] `zod`
  - [x] `tsx` or `ts-node` for local run
- [x] Add scripts (`dev`, `start`, `generate`)
- [x] Launch basic WebSocket endpoint + ping event

### Task 006 - Define shared data contracts
- [x] Define TS types + schemas for:
  - [x] `telemetry`
  - [x] `event`
  - [x] `mission`
  - [x] `incident`
- [x] Add runtime validation with `zod`
- [x] Store contracts in `packages/contracts` or `apps/web/src/shared`

## Phase 1 - Simulation and Data Pipeline

### Task 007 - Implement robot state generator
- [x] Create in-memory fleet model (6-20 robots)
- [x] Support statuses:
  - [x] `IDLE`
  - [x] `ON_MISSION`
  - [x] `NEED_ASSIST`
  - [x] `FAULT`
  - [x] `OFFLINE`
- [x] Update state every 200-500 ms

### Task 008 - Implement mission generator
- [x] Generate active missions for both modes:
  - [x] Delivery Rover Ops
  - [x] Warehouse AMR Ops
- [x] Add `progress`, `waypoints`, `target`
- [x] Add mode switch at simulation level

### Task 009 - Inject anomalies/incidents
- [x] Add probabilistic anomalies:
  - [x] localization confidence drop
  - [x] sensor fail (lidar/cam/gps/imu)
  - [x] stuck robot
  - [x] offline for 10s
  - [x] geofence violation
- [x] Emit `event` + `incident` for anomaly cases

### Task 010 - JSONL logging and run sessions
- [ ] Write stream to `data/runs/<runId>.jsonl`
- [ ] Log line type: `telemetry` or `event`
- [ ] Include `runId`, `missionId`, `robotId` in each record
- [ ] Start a new file for each simulator run

### Task 011 - WebSocket streaming protocol
- [ ] Define message types:
  - [ ] `snapshot` (initial fleet state)
  - [ ] `telemetry`
  - [ ] `event`
  - [ ] `incident`
  - [ ] `heartbeat`
- [ ] Make stream reconnect-safe with server timestamp

## Phase 2 - Frontend Skeleton and State

### Task 012 - App routing and page skeletons
- [ ] Add routes:
  - [ ] `/fleet`
  - [ ] `/map`
  - [ ] `/robots/:robotId`
  - [ ] `/incidents`
  - [ ] `/incidents/:incidentId/replay`
- [ ] Add basic page placeholders

### Task 013 - Global app state architecture
- [ ] Create Zustand store:
  - [ ] selected mode (Delivery/Warehouse)
  - [ ] selected robot
  - [ ] fleet filters/search
  - [ ] replay state (time cursor, play/pause)
- [ ] Use TanStack Query for history/replay loading

### Task 014 - WebSocket client integration
- [ ] Connect frontend to `apps/sim` via WS
- [ ] Use `@roboops/contracts` in `apps/web` for WS payload types and runtime validation
- [ ] Handle all message types
- [ ] Show connection status in UI

## Phase 3 - Core Screens

### Task 015 - Fleet Overview table (MVP-critical)
- [ ] Add columns:
  - [ ] status
  - [ ] battery %
  - [ ] temperature
  - [ ] last heartbeat (sec)
  - [ ] current mission + progress
  - [ ] localization confidence
  - [ ] faults count (24h)
- [ ] Add sort by status, battery, heartbeat
- [ ] Row click opens `Robot Detail`

### Task 016 - Fleet filters + search (MVP-critical)
- [ ] Add filters:
  - [ ] `FAULT`
  - [ ] `NEED_ASSIST`
  - [ ] `OFFLINE`
- [ ] Add search by `robotId`
- [ ] Persist filters in localStorage

### Task 017 - Live Map (Delivery + Warehouse)
- [ ] Delivery renderer: MapLibre map with robot positions and overlays
- [ ] Warehouse renderer: SVG floorplan with robot positions and zones
- [ ] Render trail of last N points
- [ ] Render current target/waypoint
- [ ] Render geozones / warehouse zones
- [ ] Click robot to open side panel

### Task 018 - Robot side panel on map
- [ ] Show quick robot status
- [ ] Show mission + progress
- [ ] Add action buttons:
  - [ ] Request assistance
  - [ ] Pause/Resume mission
  - [ ] Create incident ticket

### Task 019 - Robot Detail: Telemetry + Sensors
- [ ] Telemetry charts (speed, battery, confidence, temp)
- [ ] CPU and memory mock metrics
- [ ] Sensors health matrix (OK/WARN/FAIL)

### Task 020 - Robot Detail: Logs + Actions
- [ ] Live logs stream (INFO/WARN/ERROR)
- [ ] Log level filters
- [ ] Action buttons:
  - [ ] Request operator assistance
  - [ ] Pause/Resume mission
  - [ ] Create incident ticket

## Phase 4 - Incidents and Replay (Killer Feature)

### Task 021 - Incidents list page
- [ ] Incidents table/list fields:
  - [ ] type
  - [ ] severity
  - [ ] timestamp
  - [ ] robot_id
  - [ ] mission_id
- [ ] Add filters by type/severity/robot
- [ ] Add `Replay` action

### Task 022 - Replay data loader from JSONL
- [ ] Parse `runId.jsonl`
- [ ] Normalize events into timeline
- [ ] Extract WARN/ERROR markers

### Task 023 - Replay viewer timeline + scrubber
- [ ] Time slider with active time cursor
- [ ] Play/Pause/Speed (0.5x/1x/2x)
- [ ] Jump-to-event from markers

### Task 024 - Replay map + metrics sync
- [ ] Replay map/floorplan mode
- [ ] Render historical trajectory at selected time
- [ ] Sync metric panels over time:
  - [ ] battery
  - [ ] speed
  - [ ] localization confidence
  - [ ] error count

## Phase 5 - Incident Report

### Task 025 - Incident report generator (JSON)
- [ ] Add `Generate report` on incident detail/replay
- [ ] Include:
  - [ ] summary
  - [ ] timeline of 5-10 key events
  - [ ] metrics before/during/after
  - [ ] replay deep link with timestamp
- [ ] Export `.json`

### Task 026 - Incident report export (Markdown)
- [ ] Add markdown report template
- [ ] Export `.md`
- [ ] Add copy/share block

## Phase 6 - Quality, Demo, Packaging

### Task 027 - Error handling + UX polish
- [ ] Add loading/empty/error states on key screens
- [ ] Add toasts for actions
- [ ] Add keyboard shortcuts (search, replay play/pause)

### Task 028 - Testing baseline
- [ ] Unit tests:
  - [ ] parsers/normalizers
  - [ ] status/incident reducers
- [ ] Component tests:
  - [ ] fleet filters
  - [ ] replay scrubber sync
- [ ] Optional smoke e2e path

### Task 029 - Docs and architecture
- [ ] Update `README.md` with:
  - [ ] problem statement
  - [ ] screenshots/GIF
  - [ ] run instructions (`web` + `sim`)
  - [ ] data schemas
  - [ ] architecture diagram
  - [ ] roadmap/next steps
- [ ] Add `docs/architecture.md` + diagram

### Task 030 - Demo readiness
- [ ] Prepare 2-minute demo script
- [ ] Record demo video
- [ ] Verify reproducible one-command local run

### Task 031 - Deployment (recommended)
- [ ] Deploy frontend (Vercel/Netlify)
- [ ] Deploy simulator (Render/Fly/Railway/VM)
- [ ] Configure env vars and production WS URL

## Suggested Execution Order (review/commit cycle)
1. Task 001-006 (bootstrap + contracts)
2. Task 007-011 (simulator + stream + JSONL)
3. Task 012-014 (frontend skeleton + WS integration)
4. Task 015-020 (fleet/map/robot detail)
5. Task 021-024 (incidents + replay)
6. Task 025-026 (report export)
7. Task 027-031 (quality/docs/demo/deploy)

## MVP Definition of Done
- [ ] 4 key screens work: Fleet, Live Map, Robot Detail, Incidents + Replay
- [ ] Real-time WS telemetry stream with anomalies is working
- [ ] Replay reproduces timeline correctly from JSONL
- [ ] Incident report generation works (at least JSON)
- [ ] `README.md` + short demo video are ready
