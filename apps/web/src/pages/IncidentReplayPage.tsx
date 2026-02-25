import { useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useIncidentReplayQuery } from '../queries/replay'
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
  const replayQuery = useIncidentReplayQuery(incidentId)
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
            <p className="text-sm text-muted">
              Time: {formatTs(rangeMin)} - {formatTs(rangeMax)}
            </p>
          </div>

          <div className="rounded-panel border border-border/60 bg-surface-elevated/55 p-4">
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-muted">
                Timeline Cursor
              </span>
              <input
                className="w-full"
                max={rangeMax}
                min={rangeMin}
                onChange={(event) => setReplayCursorTs(Number(event.target.value))}
                step={1000}
                type="range"
                value={Math.min(Math.max(replayCursorTs, rangeMin), rangeMax)}
              />
            </label>

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
            <p className="text-xs uppercase tracking-[0.14em] text-muted">Active Metrics</p>
            {activeMetric ? (
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-muted md:grid-cols-4">
                <p>Battery: {activeMetric.battery}%</p>
                <p>Speed: {activeMetric.speed.toFixed(2)} m/s</p>
                <p>Confidence: {activeMetric.localizationConfidence.toFixed(2)}</p>
                <p>Errors: {activeMetric.errors}</p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">No metric sample available.</p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  )
}
