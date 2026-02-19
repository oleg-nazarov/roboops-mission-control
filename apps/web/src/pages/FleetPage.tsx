import { useAppStore, type FleetStatusFilter } from '../state/appStore'

const statusOptions: FleetStatusFilter[] = ['FAULT', 'NEED_ASSIST', 'OFFLINE']

export function FleetPage() {
  const searchQuery = useAppStore((state) => state.fleetFilters.searchQuery)
  const statusFilters = useAppStore((state) => state.fleetFilters.statusFilters)
  const setFleetSearchQuery = useAppStore((state) => state.setFleetSearchQuery)
  const toggleFleetStatusFilter = useAppStore((state) => state.toggleFleetStatusFilter)
  const clearFleetStatusFilters = useAppStore((state) => state.clearFleetStatusFilters)

  return (
    <section className="panel animate-shell-in p-5 [animation-delay:80ms]">
      <p className="text-xs uppercase tracking-[0.18em] text-muted">Fleet Overview</p>
      <h2 className="mt-2 font-display text-lg font-semibold">Fleet table placeholder</h2>
      <p className="mt-3 max-w-3xl text-sm text-muted">
        This page will show robot status, battery, heartbeat, mission progress, localization
        confidence, and 24h fault counters.
      </p>

      <div className="mt-5 grid gap-4 rounded-panel border border-border/60 bg-surface-elevated/55 p-4 md:grid-cols-[1fr_auto]">
        <label className="block">
          <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-muted">
            Search by robot id
          </span>
          <input
            className="w-full rounded-panel border border-border/70 bg-surface px-3 py-2 text-sm outline-none transition focus:border-accent/60"
            onChange={(event) => setFleetSearchQuery(event.target.value)}
            placeholder="RBT-001"
            type="text"
            value={searchQuery}
          />
        </label>

        <button
          className="self-end rounded-pill border border-border/70 bg-surface px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition hover:border-accent/45"
          onClick={clearFleetStatusFilters}
          type="button"
        >
          Clear Filters
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {statusOptions.map((status) => {
          const isActive = statusFilters.includes(status)
          return (
            <button
              className={[
                'rounded-pill border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition',
                isActive
                  ? 'border-accent/60 bg-accent-soft text-text'
                  : 'border-border/70 bg-surface text-muted hover:border-accent/40',
              ].join(' ')}
              key={status}
              onClick={() => toggleFleetStatusFilter(status)}
              type="button"
            >
              {status}
            </button>
          )
        })}
      </div>
    </section>
  )
}
