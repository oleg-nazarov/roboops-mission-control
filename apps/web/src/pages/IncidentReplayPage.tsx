import { useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useIncidentReplayQuery } from '../queries/replay'
import { ReplaySceneCanvas } from './replay/ReplaySceneCanvas'
import { useAppStore, type ReplaySpeed } from '../state/appStore'

const speedOptions: ReplaySpeed[] = [0.5, 1, 2]

const formatTs = (ts: number): string =>
  new Date(ts).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

export function IncidentReplayPage() {
  const { incidentId } = useParams()
  const wsRunId = useAppStore((state) => state.ws.runId)
  const replayIncidentHint = useAppStore((state) =>
    incidentId ? state.stream.recentIncidents.find((incident) => incident.incidentId === incidentId) : undefined,
  )
  const replayQuery = useIncidentReplayQuery(incidentId, {
    runId: wsRunId ?? undefined,
    robotId: replayIncidentHint?.robotId,
    missionId: replayIncidentHint?.missionId,
    ts: replayIncidentHint?.ts,
  })
  const replayCursorTs = useAppStore((state) => state.replay.cursorTs)
  const replayIsPlaying = useAppStore((state) => state.replay.isPlaying)
  const replaySpeed = useAppStore((state) => state.replay.speed)
  const setReplayCursorTs = useAppStore((state) => state.setReplayCursorTs)
  const setReplayPlaying = useAppStore((state) => state.setReplayPlaying)
  const setReplaySpeed = useAppStore((state) => state.setReplaySpeed)
  const advanceReplayCursor = useAppStore((state) => state.advanceReplayCursor)
  const resetReplay = useAppStore((state) => state.resetReplay)

  useEffect(() => {
    resetReplay(0)
  }, [incidentId, resetReplay])

  useEffect(() => {
    if (!replayQuery.data) {
      return
    }

    if (replayCursorTs === 0) {
      setReplayCursorTs(replayQuery.data.startedAtTs)
    }
  }, [replayCursorTs, replayQuery.data, setReplayCursorTs])

  useEffect(() => {
    if (!replayQuery.data || !replayIsPlaying) {
      return
    }

    const replayData = replayQuery.data
    const timer = setInterval(() => {
      advanceReplayCursor(200 * replaySpeed, replayData.endedAtTs)
    }, 200)

    return () => {
      clearInterval(timer)
    }
  }, [advanceReplayCursor, replayIsPlaying, replaySpeed, replayQuery.data])

  useEffect(() => {
    if (!replayQuery.data || !replayIsPlaying) {
      return
    }

    if (replayCursorTs >= replayQuery.data.endedAtTs) {
      setReplayPlaying(false)
    }
  }, [replayCursorTs, replayIsPlaying, replayQuery.data, setReplayPlaying])

  const activeMetric = useMemo(() => {
    const metrics = replayQuery.data?.metrics
    if (!metrics || metrics.length === 0) {
      return undefined
    }

    return metrics.reduce((closest, point) =>
      Math.abs(point.ts - replayCursorTs) < Math.abs(closest.ts - replayCursorTs) ? point : closest,
    )
  }, [replayCursorTs, replayQuery.data?.metrics])

  const rangeMin = replayQuery.data?.startedAtTs ?? 0
  const rangeMax = replayQuery.data?.endedAtTs ?? 0
  const clampedCursorTs = Math.min(Math.max(replayCursorTs, rangeMin), rangeMax)
  const replayDurationMs = Math.max(0, rangeMax - rangeMin)
  const cursorProgressPct =
    replayDurationMs > 0 ? ((clampedCursorTs - rangeMin) / replayDurationMs) * 100 : 0

  const timelineRows = useMemo(() => {
    const timeline = replayQuery.data?.timeline ?? []
    if (timeline.length === 0) {
      return []
    }

    return [...timeline]
      .sort((left, right) => right.ts - left.ts)
      .slice(0, 24)
  }, [replayQuery.data?.timeline])

  const jumpToTs = (ts: number): void => {
    setReplayPlaying(false)
    setReplayCursorTs(ts)
  }

  return (
    <section className="panel animate-shell-in p-5 [animation-delay:80ms]">
      <p className="text-xs uppercase tracking-[0.18em] text-muted">Replay</p>
      <h2 className="mt-2 font-display text-lg font-semibold">Incident Replay: {incidentId ?? 'unknown'}</h2>
      <p className="mt-3 max-w-3xl text-sm text-muted">
        This page will provide timeline scrubber, event markers, synchronized map replay, and metric
        panels over time.
      </p>

      {replayQuery.isLoading ? (
        <p className="mt-4 text-sm text-muted">Loading replay data...</p>
      ) : null}

      {replayQuery.isError ? (
        <p className="mt-4 text-sm text-status-fault">Failed to load incident replay data.</p>
      ) : null}

      {!replayQuery.isLoading && !replayQuery.isError && !replayQuery.data ? (
        <p className="mt-4 text-sm text-muted">No replay dataset found for this incident.</p>
      ) : null}

      {replayQuery.data ? (
        <div className="mt-4 space-y-4">
          <div className="rounded-panel border border-border/60 bg-surface-elevated/55 p-4">
            <p className="text-sm text-muted">Run: {replayQuery.data.runId}</p>
            <p className="text-sm text-muted">Robot: {replayQuery.data.robotId}</p>
            <p className="text-sm text-muted">Mode: {replayQuery.data.mode}</p>
            <p className="text-sm text-muted">
              Time: {formatTs(rangeMin)} - {formatTs(rangeMax)}
            </p>
            <p className="mt-2 rounded-panel border border-border/50 bg-surface/50 px-2.5 py-1.5 text-xs text-muted">
              Replay mode is locked to incident dataset. Header mode switch controls live stream mode
              only.
            </p>
          </div>

          <ReplaySceneCanvas
            cursorTs={clampedCursorTs}
            mode={replayQuery.data.mode ?? 'DELIVERY'}
            robotId={replayQuery.data.robotId}
            trajectory={replayQuery.data.trajectory ?? []}
          />

          <div className="rounded-panel border border-border/60 bg-surface-elevated/55 p-4">
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-muted">
                Timeline Cursor
              </span>
              <input
                className="w-full"
                max={rangeMax}
                min={rangeMin}
                onChange={(event) => jumpToTs(Number(event.target.value))}
                step={200}
                type="range"
                value={clampedCursorTs}
              />
            </label>

            <div className="mt-3 grid gap-2 text-xs text-muted md:grid-cols-3">
              <p>Cursor: {formatTs(clampedCursorTs)}</p>
              <p>
                Progress: {cursorProgressPct.toFixed(1)}% ({Math.round((clampedCursorTs - rangeMin) / 1000)}s)
              </p>
              <p>Window: {Math.round(replayDurationMs / 1000)}s</p>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                className="rounded-pill border border-border/70 bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition hover:border-accent/40"
                onClick={() => setReplayPlaying(!replayIsPlaying)}
                type="button"
              >
                {replayIsPlaying ? 'Pause' : 'Play'}
              </button>

              {speedOptions.map((speed) => (
                <button
                  className={[
                    'rounded-pill border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition',
                    replaySpeed === speed
                      ? 'border-accent/60 bg-accent-soft text-text'
                      : 'border-border/70 bg-surface text-muted hover:border-accent/40',
                  ].join(' ')}
                  key={speed}
                  onClick={() => setReplaySpeed(speed)}
                  type="button"
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-panel border border-border/60 bg-surface-elevated/55 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">Metrics Synced To Cursor</p>
            {activeMetric ? (
              <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
                <div className="rounded-panel border border-border/50 bg-surface/60 p-2">
                  <p className="text-xs uppercase tracking-[0.1em] text-muted">Battery</p>
                  <p className="mt-1 text-sm text-muted">{activeMetric.battery}%</p>
                </div>
                <div className="rounded-panel border border-border/50 bg-surface/60 p-2">
                  <p className="text-xs uppercase tracking-[0.1em] text-muted">Speed</p>
                  <p className="mt-1 text-sm text-muted">{activeMetric.speed.toFixed(2)} m/s</p>
                </div>
                <div className="rounded-panel border border-border/50 bg-surface/60 p-2">
                  <p className="text-xs uppercase tracking-[0.1em] text-muted">Confidence</p>
                  <p className="mt-1 text-sm text-muted">
                    {activeMetric.localizationConfidence.toFixed(2)}
                  </p>
                </div>
                <div className="rounded-panel border border-border/50 bg-surface/60 p-2">
                  <p className="text-xs uppercase tracking-[0.1em] text-muted">Error Count</p>
                  <p className="mt-1 text-sm text-muted">{activeMetric.errors}</p>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">No metric sample available.</p>
            )}
          </div>

          <div className="rounded-panel border border-border/60 bg-surface-elevated/55 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">Timeline Events (Jump)</p>
            {timelineRows.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No timeline events available.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {timelineRows.map((eventItem, index) => (
                  <button
                    className="flex w-full cursor-pointer items-start justify-between gap-3 rounded-panel border border-border/60 bg-surface/55 px-3 py-2 text-left text-sm transition hover:border-accent/45"
                    key={`${eventItem.ts}-${eventItem.eventType}-${index}`}
                    onClick={() => jumpToTs(eventItem.ts)}
                    type="button"
                  >
                    <span className="min-w-0 text-muted">
                      [{eventItem.level}] {eventItem.eventType} - {eventItem.message}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-muted">{formatTs(eventItem.ts)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  )
}
