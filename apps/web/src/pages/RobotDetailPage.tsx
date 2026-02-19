import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useAppStore } from '../state/appStore'

export function RobotDetailPage() {
  const { robotId } = useParams()
  const setSelectedRobotId = useAppStore((state) => state.setSelectedRobotId)

  useEffect(() => {
    setSelectedRobotId(robotId ?? null)

    return () => {
      setSelectedRobotId(null)
    }
  }, [robotId, setSelectedRobotId])

  return (
    <section className="panel animate-shell-in p-5 [animation-delay:80ms]">
      <p className="text-xs uppercase tracking-[0.18em] text-muted">Robot Detail</p>
      <h2 className="mt-2 font-display text-lg font-semibold">Robot: {robotId ?? 'unknown'}</h2>
      <p className="mt-3 max-w-3xl text-sm text-muted">
        This page will include telemetry charts, sensor health, live logs, and operator actions.
      </p>
    </section>
  )
}
