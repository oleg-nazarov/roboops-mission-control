import { useEffect, useMemo, useState } from 'react'

type OpsMode = 'delivery' | 'warehouse'

const navItems = ['Fleet Overview', 'Live Map', 'Robot Detail', 'Incidents', 'Replay']

const telemetryPreview = [
  { label: 'Active Robots', value: '14', trend: '+2' },
  { label: 'Open Incidents', value: '3', trend: '-1' },
  { label: 'Need Assist', value: '2', trend: 'stable' },
  { label: 'Mean Battery', value: '74%', trend: '+4%' },
]

function App() {
  const [mode, setMode] = useState<OpsMode>('delivery')

  useEffect(() => {
    document.documentElement.dataset.mode = mode
  }, [mode])

  const modeTitle = useMemo(
    () => (mode === 'delivery' ? 'Delivery Rover Ops' : 'Warehouse AMR Ops'),
    [mode],
  )

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
          </div>

          <div className="flex items-center gap-2 rounded-pill border border-border/70 bg-surface-elevated/80 p-1">
            <button
              className="mode-button"
              data-active={mode === 'delivery'}
              onClick={() => setMode('delivery')}
              type="button"
            >
              Delivery
            </button>
            <button
              className="mode-button"
              data-active={mode === 'warehouse'}
              onClick={() => setMode('warehouse')}
              type="button"
            >
              Warehouse
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 gap-5 p-shell lg:grid-cols-[var(--ui-space-sidebar)_1fr]">
        <aside className="panel animate-shell-in p-5">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-display text-base font-semibold">Navigation</h2>
            <span className="h-2.5 w-2.5 rounded-full bg-status-on-mission shadow-[0_0_0_6px_hsl(var(--ui-status-on-mission)_/_0.2)] animate-pulse-soft" />
          </div>

          <nav aria-label="Primary sections" className="space-y-2">
            {navItems.map((item, index) => (
              <button
                key={item}
                className="group flex w-full items-center justify-between rounded-panel border border-border/50 bg-surface-elevated/50 px-3 py-2.5 text-left transition hover:border-accent/40 hover:bg-surface-elevated/80"
                type="button"
              >
                <span className="text-sm font-medium">{item}</span>
                <span className="font-mono text-xs text-muted/70 group-hover:text-accent">
                  0{index + 1}
                </span>
              </button>
            ))}
          </nav>

          <div className="mt-6 rounded-panel border border-border/60 bg-bg/35 p-3">
            <p className="mb-2 text-xs uppercase tracking-[0.18em] text-muted">Theme Hook</p>
            <p className="text-sm text-muted">
              Active <code className="rounded bg-surface-elevated px-1.5 py-0.5">{`data-mode="${mode}"`}</code>
            </p>
          </div>
        </aside>

        <main className="space-y-5">
          <section className="panel animate-shell-in p-5 [animation-delay:80ms]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted">Operations Snapshot</p>
                <h2 className="font-display text-lg font-semibold">
                  Fleet Health and Incident Signal
                </h2>
              </div>
              <span className="rounded-pill border border-accent/40 bg-accent-soft px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em]">
                Live Stream Ready
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {telemetryPreview.map((item, index) => (
                <article
                  className="rounded-panel border border-border/60 bg-surface-elevated/70 p-4 transition hover:border-accent/50"
                  key={item.label}
                >
                  <p className="text-xs uppercase tracking-[0.14em] text-muted">{item.label}</p>
                  <p className="mt-2 font-display text-2xl font-semibold">{item.value}</p>
                  <p className="mt-1 text-xs text-muted">Trend: {item.trend}</p>
                  <div
                    className="mt-3 h-1.5 rounded-pill bg-accent-soft"
                    style={{ width: `${Math.max(22, 85 - index * 14)}%` }}
                  />
                </article>
              ))}
            </div>
          </section>

          <section className="panel animate-shell-in p-5 [animation-delay:140ms]">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">UI Foundation</p>
            <h3 className="mt-2 font-display text-lg font-semibold">Styling Stack is Ready</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="rounded-panel border border-border/60 bg-surface-elevated/65 p-3">
                <p className="text-sm font-semibold">Tailwind Utilities</p>
                <p className="mt-1 text-sm text-muted">
                  Layout, spacing, typography, and motion are utility-driven.
                </p>
              </div>
              <div className="rounded-panel border border-border/60 bg-surface-elevated/65 p-3">
                <p className="text-sm font-semibold">CSS Variables</p>
                <p className="mt-1 text-sm text-muted">
                  Design tokens control semantic colors, states, and theme switching.
                </p>
              </div>
              <div className="rounded-panel border border-border/60 bg-surface-elevated/65 p-3">
                <p className="text-sm font-semibold">Renderer Compatibility</p>
                <p className="mt-1 text-sm text-muted">
                  Shared tokens are prepared for both MapLibre and SVG floorplan layers.
                </p>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}

export default App
