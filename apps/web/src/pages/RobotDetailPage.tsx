import type { SensorHealth } from '@roboops/contracts'
import { useEffect, useMemo } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
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

type TelemetryChartCardProps = {
  title: string
  data: ChartPoint[]
  dataKey: keyof ChartPoint
  color: string
  unit?: string
  domain?: [number, number]
}

function TelemetryChartCard({ title, data, dataKey, color, unit, domain }: TelemetryChartCardProps) {
  const yAxisWidth = unit ? 78 : 58
  const formatAxisValue = (value: number): string => {
    const normalized = Math.abs(value) >= 10 ? value.toFixed(1) : value.toFixed(2)
    const trimmed = normalized.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
    return `${trimmed}${unit ?? ''}`
  }

  return (
    <article className="rounded-panel border border-border/60 bg-surface-elevated/55 p-3">
      <p className="text-xs uppercase tracking-[0.12em] text-muted">{title}</p>
      <div className="mt-3 h-40">
        <ResponsiveContainer height="100%" width="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, left: 4, bottom: 0 }}>
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
        </ResponsiveContainer>
      </div>
    </article>
  )
}

export function RobotDetailPage() {
  const { robotId } = useParams()
  const setSelectedRobotId = useAppStore((state) => state.setSelectedRobotId)
  const snapshot = useAppStore((state) => state.stream.snapshot)
  const telemetryByRobot = useAppStore((state) => state.stream.telemetryByRobot)
  const telemetryHistoryByRobot = useAppStore((state) => state.stream.telemetryHistoryByRobot)

  useEffect(() => {
    setSelectedRobotId(robotId ?? null)

    return () => {
      setSelectedRobotId(null)
    }
  }, [robotId, setSelectedRobotId])

  const snapshotRobot = useMemo(
    () => snapshot?.robots.find((robot) => robot.robotId === robotId) ?? null,
    [robotId, snapshot?.robots],
  )
  const telemetry = robotId ? telemetryByRobot[robotId] : undefined
  const telemetryHistory = useMemo(
    () => (robotId ? telemetryHistoryByRobot[robotId] ?? [] : []),
    [robotId, telemetryHistoryByRobot],
  )

  const chartData = useMemo<ChartPoint[]>(() => {
    if (!robotId) {
      return []
    }

    const robotSeed = hashRobotId(robotId)
    return telemetryHistory.map((point, index) => {
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
  }, [robotId, telemetryHistory])

  const latestPoint = chartData[chartData.length - 1] ?? null
  const sensors = telemetry?.sensors ?? snapshotRobot?.sensors ?? null

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
        </div>
      )}
    </section>
  )
}
