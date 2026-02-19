export function LiveMapPage() {
  return (
    <section className="panel animate-shell-in p-5 [animation-delay:80ms]">
      <p className="text-xs uppercase tracking-[0.18em] text-muted">Live Map</p>
      <h2 className="mt-2 font-display text-lg font-semibold">Map renderer placeholder</h2>
      <p className="mt-3 max-w-3xl text-sm text-muted">
        This page will render robot positions, trails, targets, and zones using MapLibre for
        delivery mode and SVG floorplan for warehouse mode.
      </p>
    </section>
  )
}
