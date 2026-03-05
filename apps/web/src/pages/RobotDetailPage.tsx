import type { EventLevel, SensorHealth } from '@roboops/contracts'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useParams } from 'react-router-dom'
import { useAppStore } from '../state/appStore'

type ChartPoint = {
  ts: number
  speed: number
  battery: number
  localizationConfidence: number
  temp: number
  cpu: number
  memory: number
}

const EMPTY_TELEMETRY_HISTORY: Array<{
  ts: number
  speed: number
  battery: number
  localizationConfidence: number
  temp: number
}> = []

const chartStroke = {
  speed: '#5da2f6',
  battery: '#5bbf79',
  confidence: '#6fd7df',
  temp: '#d99147',
  cpu: '#bb87ff',
  memory: '#8aa3c8',
}

const sensorBadgeClassName: Record<SensorHealth, string> = {
  OK: 'bg-status-idle/20 text-status-idle border-status-idle/30',
  WARN: 'bg-status-need-assist/20 text-status-need-assist border-status-need-assist/30',
  FAIL: 'bg-status-fault/20 text-status-fault border-status-fault/30',
}

const logLevelBadgeClassName: Record<EventLevel, string> = {
  INFO: 'bg-accent-soft/55 text-accent border-accent/30',
  WARN: 'bg-status-need-assist/18 text-status-need-assist border-status-need-assist/35',
  ERROR: 'bg-status-fault/18 text-status-fault border-status-fault/35',
}

const logLevelFilterChipClassName: Record<EventLevel, string> = {
  INFO: 'data-[active=true]:border-accent/45 data-[active=true]:bg-accent-soft/50 data-[active=true]:text-accent',
  WARN: 'data-[active=true]:border-status-need-assist/45 data-[active=true]:bg-status-need-assist/18 data-[active=true]:text-status-need-assist',
  ERROR: 'data-[active=true]:border-status-fault/45 data-[active=true]:bg-status-fault/18 data-[active=true]:text-status-fault',
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

const hashRobotId = (robotId: string): number => {
  let hash = 0
  for (let index = 0; index < robotId.length; index += 1) {
    hash = (hash * 31 + robotId.charCodeAt(index)) % 10_000
  }
  return hash
}

const formatShortTime = (ts: number): string =>
  new Date(ts).toLocaleTimeString('en-US', {
    minute: '2-digit',
    second: '2-digit',
  })

const formatLogTime = (ts: number): string =>
  new Date(ts).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

type TelemetryChartCardProps = {
  title: string
  data: ChartPoint[]
  dataKey: keyof ChartPoint
  color: string
  unit?: string
  domain?: [number, number]
}

function TelemetryChartCard({ title, data, dataKey, color, unit, domain }: TelemetryChartCardProps) {
  const chartContainerRef = useRef<HTMLDivElement | null>(null)
  const [chartSize, setChartSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 160,
  })
  const yAxisWidth = unit ? 78 : 58
  const formatAxisValue = (value: number): string => {
    const normalized = Math.abs(value) >= 10 ? value.toFixed(1) : value.toFixed(2)
    const trimmed = normalized.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
    return `${trimmed}${unit ?? ''}`
  }

  useEffect(() => {
    const container = chartContainerRef.current
    if (!container) {
      return
    }

    const updateSize = (): void => {
      const rect = container.getBoundingClientRect()
      const width = Math.max(0, Math.floor(rect.width))
      const height = Math.max(120, Math.floor(rect.height))

      setChartSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      )
    }

    updateSize()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize)
      return () => {
        window.removeEventListener('resize', updateSize)
      }
    }

    const observer = new ResizeObserver(() => {
      updateSize()
    })
    observer.observe(container)

    return () => {
      observer.disconnect()
    }
  }, [])

  return (
    <article className="rounded-panel border border-border/60 bg-surface-elevated/55 p-3">
      <p className="text-xs uppercase tracking-[0.12em] text-muted">{title}</p>
      <div className="mt-3 h-40 min-w-0" ref={chartContainerRef}>
        {chartSize.width > 0 ? (
          <LineChart
            data={data}
            height={chartSize.height}
            margin={{ top: 10, right: 10, left: 4, bottom: 0 }}
            width={chartSize.width}
          >
            <CartesianGrid stroke="hsl(var(--ui-color-border) / 0.35)" strokeDasharray="3 4" />
            <XAxis
              dataKey="ts"
              minTickGap={20}
              stroke="hsl(var(--ui-color-muted))"
              tick={{ fill: 'hsl(var(--ui-color-muted))', fontSize: 11 }}
              tickFormatter={formatShortTime}
            />
            <YAxis
              domain={domain}
              stroke="hsl(var(--ui-color-muted))"
              tick={{ fill: 'hsl(var(--ui-color-muted))', fontSize: 11 }}
              tickFormatter={formatAxisValue}
              width={yAxisWidth}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: '1px solid hsl(var(--ui-color-border) / 0.7)',
                background: 'hsl(var(--ui-color-surface) / 0.97)',
              }}
              formatter={(value) => [`${Number(value ?? 0).toFixed(2)}${unit ?? ''}`, title]}
              labelFormatter={(label) =>
                typeof label === 'number' ? formatShortTime(label) : String(label ?? '')
              }
            />
            <Line
              dataKey={dataKey}
              dot={false}
              isAnimationActive={false}
              stroke={color}
              strokeWidth={2.1}
              type="monotone"
            />
          </LineChart>
        ) : null}
      </div>
    </article>
  )
}

export function RobotDetailPage() {
  const { robotId } = useParams()
  const setSelectedRobotId = useAppStore((state) => state.setSelectedRobotId)
  const snapshotRobot = useAppStore((state) =>
    robotId ? state.stream.snapshot?.robots.find((robot) => robot.robotId === robotId) ?? null : null,
  )
  const telemetry = useAppStore((state) =>
    robotId ? state.stream.telemetryByRobot[robotId] : undefined,
  )
  const telemetryHistory = useAppStore((state) =>
    robotId ? state.stream.telemetryHistoryByRobot[robotId] ?? EMPTY_TELEMETRY_HISTORY : EMPTY_TELEMETRY_HISTORY,
  )
  const recentEvents = useAppStore((state) => state.stream.recentEvents)
  const operatorActionsByRobot = useAppStore((state) => state.operatorActions.byRobot)
  const requestOperatorAssistance = useAppStore((state) => state.requestOperatorAssistance)
  const toggleRobotMissionPause = useAppStore((state) => state.toggleRobotMissionPause)
  const createIncidentTicket = useAppStore((state) => state.createIncidentTicket)
  const [logLevelFilters, setLogLevelFilters] = useState<Record<EventLevel, boolean>>({
    INFO: true,
    WARN: true,
    ERROR: true,
  })

  useEffect(() => {
    setSelectedRobotId(robotId ?? null)

    return () => {
      setSelectedRobotId(null)
    }
  }, [robotId, setSelectedRobotId])
  const deferredTelemetryHistory = useDeferredValue(telemetryHistory)
  const deferredRecentEvents = useDeferredValue(recentEvents)

  const chartData = useMemo<ChartPoint[]>(() => {
    if (!robotId) {
      return []
    }

    const robotSeed = hashRobotId(robotId)
    return deferredTelemetryHistory.map((point, index) => {
      const deterministicNoise = Math.sin((point.ts + robotSeed + index * 17) / 2800)
      const cpu = clamp(28 + point.speed * 18 + point.temp * 0.65 + deterministicNoise * 6, 5, 98)
      const memory = clamp(
        34 + (1 - point.localizationConfidence) * 38 + point.speed * 10 + deterministicNoise * 5,
        8,
        97,
      )

      return {
        ...point,
        cpu: Number(cpu.toFixed(2)),
        memory: Number(memory.toFixed(2)),
      }
    })
  }, [deferredTelemetryHistory, robotId])

  const latestPoint = chartData[chartData.length - 1] ?? null
  const sensors = telemetry?.sensors ?? snapshotRobot?.sensors ?? null
  const missionId = telemetry?.missionId ?? snapshotRobot?.missionId ?? null
  const operatorActionState = robotId ? operatorActionsByRobot[robotId] : undefined

  const robotLogs = useMemo(() => {
    if (!robotId) {
      return []
    }

    return deferredRecentEvents
      .filter((event) => event.robotId === robotId)
      .filter((event) => logLevelFilters[event.level])
      .slice(0, 120)
  }, [deferredRecentEvents, logLevelFilters, robotId])

  const toggleLogLevel = (level: EventLevel): void => {
    setLogLevelFilters((previous) => ({
      ...previous,
      [level]: !previous[level],
    }))
  }

  return (
    <section className="panel animate-shell-in p-5 [animation-delay:80ms]">
      <p className="text-xs uppercase tracking-[0.18em] text-muted">Robot Detail</p>
      <h2 className="mt-2 font-display text-lg font-semibold">Robot: {robotId ?? 'unknown'}</h2>

      {!robotId ? (
        <p className="mt-3 text-sm text-status-fault">Robot ID is missing in route.</p>
      ) : !snapshotRobot && !telemetry ? (
        <p className="mt-3 text-sm text-status-fault">Robot not found in current stream.</p>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-panel border border-border/60 bg-surface-elevated/55 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-muted">Current Speed</p>
              <p className="mt-2 font-display text-xl">{(telemetry?.speed ?? snapshotRobot?.speed ?? 0).toFixed(2)} m/s</p>
            </div>
            <div className="rounded-panel border border-border/60 bg-surface-elevated/55 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-muted">Battery</p>
              <p className="mt-2 font-display text-xl">{(telemetry?.battery ?? snapshotRobot?.battery ?? 0).toFixed(1)}%</p>
            </div>
            <div className="rounded-panel border border-border/60 bg-surface-elevated/55 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-muted">CPU (mock)</p>
              <p className="mt-2 font-display text-xl">{(latestPoint?.cpu ?? 0).toFixed(1)}%</p>
            </div>
            <div className="rounded-panel border border-border/60 bg-surface-elevated/55 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-muted">Memory (mock)</p>
              <p className="mt-2 font-display text-xl">{(latestPoint?.memory ?? 0).toFixed(1)}%</p>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <TelemetryChartCard
              color={chartStroke.speed}
              data={chartData}
              dataKey="speed"
              title="Speed"
              unit=" m/s"
            />
            <TelemetryChartCard
              color={chartStroke.battery}
              data={chartData}
              dataKey="battery"
              domain={[0, 100]}
              title="Battery"
              unit="%"
            />
            <TelemetryChartCard
              color={chartStroke.confidence}
              data={chartData}
              dataKey="localizationConfidence"
              domain={[0, 1]}
              title="Localization Confidence"
            />
            <TelemetryChartCard
              color={chartStroke.temp}
              data={chartData}
              dataKey="temp"
              title="Temperature"
              unit=" C"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <TelemetryChartCard
              color={chartStroke.cpu}
              data={chartData}
              dataKey="cpu"
              domain={[0, 100]}
              title="CPU (mock)"
              unit="%"
            />
            <TelemetryChartCard
              color={chartStroke.memory}
              data={chartData}
              dataKey="memory"
              domain={[0, 100]}
              title="Memory (mock)"
              unit="%"
            />
          </div>

          <article className="rounded-panel border border-border/60 bg-surface-elevated/55 p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-muted">Sensors Health Matrix</p>
            {sensors ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {(Object.keys(sensors) as Array<keyof typeof sensors>).map((sensorKey) => (
                  <div
                    className="rounded-panel border border-border/50 bg-surface/70 p-3"
                    key={sensorKey}
                  >
                    <p className="text-xs uppercase tracking-[0.12em] text-muted">{sensorKey}</p>
                    <span
                      className={[
                        'mt-2 inline-flex rounded-pill border px-2.5 py-1 text-xs font-semibold',
                        sensorBadgeClassName[sensors[sensorKey]],
                      ].join(' ')}
                    >
                      {sensors[sensorKey]}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">No sensor telemetry yet.</p>
            )}
          </article>

          <article className="rounded-panel border border-border/60 bg-surface-elevated/55 p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-muted">Actions</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="rounded-pill border border-border/70 bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition hover:border-status-need-assist/55"
                onClick={() => {
                  if (!robotId) {
                    return
                  }
                  requestOperatorAssistance({
                    robotId,
                    missionId,
                  })
                }}
                type="button"
              >
                Request Operator Assistance
              </button>
              <button
                className="rounded-pill border border-border/70 bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition hover:border-accent/55 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!missionId || !robotId}
                onClick={() => {
                  if (!robotId) {
                    return
                  }
                  toggleRobotMissionPause({
                    robotId,
                    missionId,
                  })
                }}
                type="button"
              >
                {operatorActionState?.missionPaused ? 'Resume Mission' : 'Pause Mission'}
              </button>
              <button
                className="rounded-pill border border-border/70 bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition hover:border-status-fault/55 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!robotId}
                onClick={() => {
                  if (!robotId) {
                    return
                  }
                  createIncidentTicket({
                    robotId,
                    missionId,
                  })
                }}
                type="button"
              >
                Create Incident Ticket
              </button>
            </div>
            {operatorActionState?.lastActionLabel ? (
              <p className="mt-2 text-xs text-muted">
                Last action: {operatorActionState.lastActionLabel}
              </p>
            ) : null}
          </article>

          <article className="rounded-panel border border-border/60 bg-surface-elevated/55 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-[0.12em] text-muted">Live Logs</p>
              <div className="flex flex-wrap gap-2">
                {(['INFO', 'WARN', 'ERROR'] as EventLevel[]).map((level) => (
                  <button
                    className={[
                      'rounded-pill border border-border/55 bg-surface px-2.5 py-1 text-xs font-semibold tracking-[0.06em] text-muted transition',
                      logLevelFilterChipClassName[level],
                    ].join(' ')}
                    data-active={logLevelFilters[level]}
                    key={level}
                    onClick={() => toggleLogLevel(level)}
                    type="button"
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            {robotLogs.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No logs available for the selected filters.</p>
            ) : (
              <div className="mt-3 max-h-[320px] space-y-2 overflow-auto pr-1">
                {robotLogs.map((logEvent) => (
                  <div
                    className="rounded-panel border border-border/50 bg-surface/70 p-3"
                    key={`${logEvent.ts}-${logEvent.eventType}-${logEvent.message}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-muted">{formatLogTime(logEvent.ts)}</span>
                      <span
                        className={[
                          'rounded-pill border px-2 py-0.5 text-xs font-semibold',
                          logLevelBadgeClassName[logEvent.level],
                        ].join(' ')}
                      >
                        {logEvent.level}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-text">{logEvent.message}</p>
                    <p className="mt-1 font-mono text-xs text-muted/90">{logEvent.eventType}</p>
                  </div>
                ))}
              </div>
            )}
          </article>
        </div>
      )}
    </section>
  )
}
