import { useEffect, useMemo } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { FleetPage } from './pages/FleetPage'
import { IncidentReplayPage } from './pages/IncidentReplayPage'
import { IncidentsPage } from './pages/IncidentsPage'
import { LiveMapPage } from './pages/LiveMapPage'
import { RobotDetailPage } from './pages/RobotDetailPage'
import { useAppStore, type OpsMode, type WsConnectionStatus } from './state/appStore'
import { useOpsWebSocket } from './ws/useOpsWebSocket'

type NavItem = {
  label: string
  path: string
  badge: string
  exact: boolean
}

const navItems: NavItem[] = [
  { label: 'Fleet Overview', path: '/fleet', badge: '01', exact: true },
  { label: 'Live Map', path: '/map', badge: '02', exact: true },
  { label: 'Incidents', path: '/incidents', badge: '03', exact: true },
  { label: 'Replay', path: '/incidents/INC-000001/replay', badge: '04', exact: true },
  { label: 'Robot Detail', path: '/robots/RBT-001', badge: '05', exact: false },
]

const routeTitles: Record<string, string> = {
  '/fleet': 'Fleet Overview',
  '/map': 'Live Map',
  '/incidents': 'Incidents',
}

const connectionStatusClasses: Record<WsConnectionStatus, string> = {
  idle: 'bg-status-offline',
  connecting: 'bg-status-need-assist',
  connected: 'bg-status-on-mission',
  reconnecting: 'bg-status-need-assist',
  error: 'bg-status-fault',
}

function App() {
  const { wsUrl, sendSetModeCommand } = useOpsWebSocket()
  const mode = useAppStore((state) => state.mode)
  const setMode = useAppStore((state) => state.setMode)
  const selectedRobotId = useAppStore((state) => state.selectedRobotId)
  const searchQuery = useAppStore((state) => state.fleetFilters.searchQuery)
  const statusFilters = useAppStore((state) => state.fleetFilters.statusFilters)
  const wsStatus = useAppStore((state) => state.ws.status)
  const wsRunId = useAppStore((state) => state.ws.runId)
  const wsErrorMessage = useAppStore((state) => state.ws.errorMessage)
  const location = useLocation()

  useEffect(() => {
    document.documentElement.dataset.mode = mode
  }, [mode])

  const modeTitle = useMemo(
    () => (mode === 'delivery' ? 'Delivery Rover Ops' : 'Warehouse AMR Ops'),
    [mode],
  )

  const currentRouteTitle = useMemo(() => {
    if (location.pathname.startsWith('/robots/')) {
      return 'Robot Detail'
    }

    if (location.pathname.startsWith('/incidents/') && location.pathname.endsWith('/replay')) {
      return 'Replay'
    }

    return routeTitles[location.pathname] ?? 'Mission Control'
  }, [location.pathname])

  const onModeSelect = (nextMode: OpsMode): void => {
    setMode(nextMode)
    sendSetModeCommand(nextMode)
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-bg text-text">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_hsl(var(--ui-color-accent)_/_0.18),_transparent_50%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(140deg,_transparent_0%,_hsl(var(--ui-color-accent-soft)_/_0.28)_100%)]" />

      <header className="sticky top-0 z-20 border-b border-border/70 bg-surface/85 px-shell py-4 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-4">
          <div>
            <p className="font-display text-xs uppercase tracking-[0.2em] text-muted">
              RoboOps Mission Control
            </p>
            <h1 className="font-display text-xl font-semibold">{modeTitle}</h1>
            <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted">{currentRouteTitle}</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-pill border border-border/70 bg-surface-elevated/80 px-3 py-2">
              <div className="flex items-center gap-2">
                <span
                  className={[
                    'h-2.5 w-2.5 rounded-full',
                    connectionStatusClasses[wsStatus],
                  ].join(' ')}
                />
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  WS {wsStatus}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-pill border border-border/70 bg-surface-elevated/80 p-1">
              <button
                className="mode-button"
                data-active={mode === 'delivery'}
                onClick={() => onModeSelect('delivery')}
                type="button"
              >
                Delivery
              </button>
              <button
                className="mode-button"
                data-active={mode === 'warehouse'}
                onClick={() => onModeSelect('warehouse')}
                type="button"
              >
                Warehouse
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 gap-5 p-shell lg:grid-cols-[var(--ui-space-sidebar)_1fr]">
        <aside className="panel animate-shell-in p-5">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-display text-base font-semibold">Navigation</h2>
            <span className="h-2.5 w-2.5 animate-pulse-soft rounded-full bg-status-on-mission shadow-[0_0_0_6px_hsl(var(--ui-status-on-mission)_/_0.2)]" />
          </div>

          <nav aria-label="Primary sections" className="space-y-2">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                className={({ isActive }) =>
                  [
                    'group flex w-full items-center justify-between rounded-panel border px-3 py-2.5 text-left transition',
                    isActive
                      ? 'border-accent/55 bg-accent-soft/45'
                      : 'border-border/50 bg-surface-elevated/50 hover:border-accent/40 hover:bg-surface-elevated/80',
                  ].join(' ')
                }
                end={item.exact}
                to={item.path}
              >
                <span className="text-sm font-medium">{item.label}</span>
                <span className="font-mono text-xs text-muted/70 group-hover:text-accent">{item.badge}</span>
              </NavLink>
            ))}
          </nav>

          <div className="mt-6 rounded-panel border border-border/60 bg-bg/35 p-3">
            <p className="mb-2 text-xs uppercase tracking-[0.18em] text-muted">Theme Hook</p>
            <p className="text-sm text-muted">
              Active{' '}
              <code className="rounded bg-surface-elevated px-1.5 py-0.5">{`data-mode="${mode}"`}</code>
            </p>
          </div>

          <div className="mt-3 rounded-panel border border-border/60 bg-bg/35 p-3">
            <p className="mb-2 text-xs uppercase tracking-[0.18em] text-muted">State Snapshot</p>
            <p className="text-sm text-muted">Selected robot: {selectedRobotId ?? 'none'}</p>
            <p className="text-sm text-muted">Fleet search: {searchQuery || 'empty'}</p>
            <p className="text-sm text-muted">
              Status filters: {statusFilters.length > 0 ? statusFilters.join(', ') : 'none'}
            </p>
            <p className="text-sm text-muted">WS URL: {wsUrl}</p>
            <p className="text-sm text-muted">Run session: {wsRunId ?? 'n/a'}</p>
            {wsErrorMessage ? <p className="text-sm text-status-fault">WS error: {wsErrorMessage}</p> : null}
          </div>
        </aside>

        <main className="space-y-5">
          <Routes>
            <Route element={<Navigate replace to="/fleet" />} path="/" />
            <Route element={<FleetPage />} path="/fleet" />
            <Route element={<LiveMapPage />} path="/map" />
            <Route element={<RobotDetailPage />} path="/robots/:robotId" />
            <Route element={<IncidentsPage />} path="/incidents" />
            <Route element={<IncidentReplayPage />} path="/incidents/:incidentId/replay" />
            <Route element={<Navigate replace to="/fleet" />} path="*" />
          </Routes>
        </main>
      </div>
    </div>
  )
}

export default App
