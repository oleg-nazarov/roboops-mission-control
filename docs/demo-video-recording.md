# Demo Video Recording Guide

This guide is for producing the final 2-minute demo video.

## Recording Settings

- Resolution: `1920x1080`
- Frame rate: `30 fps`
- Aspect ratio: `16:9`
- Capture area: browser window only
- Browser zoom: `100%`

## Pre-Recording Checklist

- Start local stack with one command:
  - `npm run dev`
- Confirm endpoints:
  - Web: `http://127.0.0.1:5173`
  - WS: `ws://localhost:8090`
  - Replay API: `http://localhost:8091`
- Keep one stable simulator session for the entire recording.
- Close unrelated apps and disable desktop notifications.

## Recording Flow

- Follow `docs/demo-script.md` timing.
- Keep narration concise and technical.
- If a glitch happens, restart from the current segment boundary.

## Export

- Output format: `mp4` (H.264)
- Suggested filename: `docs/media/roboops-demo-2min.mp4`
