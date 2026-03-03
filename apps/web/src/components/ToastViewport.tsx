import { useEffect } from 'react'
import { useAppStore, type ToastTone } from '../state/appStore'

const TOAST_TTL_MS = 3800

const toneClassName: Record<ToastTone, string> = {
  info: 'border-accent/45 bg-accent-soft/45',
  success: 'border-status-idle/45 bg-status-idle/16',
  warn: 'border-status-need-assist/45 bg-status-need-assist/16',
  error: 'border-status-fault/45 bg-status-fault/16',
}

export function ToastViewport() {
  const items = useAppStore((state) => state.toast.items)
  const removeToast = useAppStore((state) => state.removeToast)

  useEffect(() => {
    if (items.length === 0) {
      return
    }

    const timers = items.map((item) =>
      window.setTimeout(() => {
        removeToast(item.toastId)
      }, Math.max(1200, TOAST_TTL_MS - (Date.now() - item.createdAtTs))),
    )

    return () => {
      for (const timer of timers) {
        window.clearTimeout(timer)
      }
    }
  }, [items, removeToast])

  if (items.length === 0) {
    return null
  }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[120] flex w-[min(92vw,380px)] flex-col gap-2">
      {items.map((item) => (
        <article
          className={[
            'pointer-events-auto rounded-panel border px-3 py-2 shadow-elevation backdrop-blur-xl',
            toneClassName[item.tone],
          ].join(' ')}
          key={item.toastId}
          role="status"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">{item.title}</p>
              {item.description ? <p className="mt-1 text-xs text-muted">{item.description}</p> : null}
            </div>
            <button
              className="rounded-pill border border-border/60 bg-surface px-2 py-0.5 text-xs text-muted transition hover:border-accent/45 hover:text-text"
              onClick={() => removeToast(item.toastId)}
              type="button"
            >
              Dismiss
            </button>
          </div>
        </article>
      ))}
    </div>
  )
}
