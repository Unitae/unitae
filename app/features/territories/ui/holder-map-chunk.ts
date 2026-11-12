import maplibreWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'

// The territory map's code (MapLibre and its worker, about 450 KB over the network): asked for once and shared, by
// the territory page as soon as it runs and by the « Mes territoires » list while it sits idle — so the map a
// publisher opens next usually comes from the cache.

let loading: Promise<typeof import('~/features/territories/ui/HolderMapCanvas')> | null = null

export function loadHolderMapCanvas() {
  loading ??= import('~/features/territories/ui/HolderMapCanvas')
  return loading
}

/** The worker MapLibre starts once its code runs: fetched ahead, it then comes from the cache. */
export const MAPLIBRE_WORKER_URL = maplibreWorker

/** Fetches the map's code and worker when the browser has nothing better to do. Browser only. */
export function prefetchHolderMapCanvas(): () => void {
  const start = () => {
    loadHolderMapCanvas().catch(() => {
      // A failed prefetch costs nothing: the page that needs the map asks again.
      loading = null
    })
    if (document.querySelector(`link[href="${MAPLIBRE_WORKER_URL}"]`) != null) return
    const link = document.createElement('link')
    link.rel = 'prefetch'
    link.href = MAPLIBRE_WORKER_URL
    document.head.append(link)
  }
  // Safari has no idle callback: a short delay stands in for it.
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(start, { timeout: 4000 })
    return () => window.cancelIdleCallback(id)
  }
  const id = window.setTimeout(start, 1500)
  return () => window.clearTimeout(id)
}
