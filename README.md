# RoboOps Mission Control

RoboOps Mission Control is an MVP operator console for autonomous robot fleets.
It focuses on real-time fleet operations, incident handling, and mission replay from recorded telemetry.

## Problem

Autonomy teams need tools to:
- monitor fleet health in real time,
- detect and triage incidents quickly,
- replay robot behavior with timeline-linked events and metrics.

## MVP Scope

- Fleet Overview
- Live Map
- Robot Detail
- Incidents + Replay
- JSON incident report generation

## Project Structure

- `apps/web` - frontend app (React + TypeScript + Vite)
- `apps/sim` - simulator and WebSocket stream server
- `data` - generated run data and JSONL logs
- `docs` - architecture notes and assets

## Status

Project bootstrap is in progress.
See `ROADMAP.md` for the full task breakdown and sequence.
