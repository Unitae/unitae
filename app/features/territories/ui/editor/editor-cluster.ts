import { type Renderer, SuperClusterAlgorithm } from '@googlemaps/markerclusterer'

import type { ClustererOptions } from '~/features/territories/ui/use-marker-clusterer'

/**
 * The editor's groups of entrances, drawn in the app's look rather than the library's coloured bubbles: a quiet disc
 * with the count, a little larger as it holds more. Built once: the clusterer keeps it.
 */
const renderer: Renderer = {
  render: ({ count, position }) => {
    const size = count < 10 ? 26 : count < 100 ? 32 : 38
    const disc = document.createElement('div')
    disc.textContent = String(count)
    Object.assign(disc.style, {
      width: `${size}px`,
      height: `${size}px`,
      display: 'grid',
      placeItems: 'center',
      borderRadius: '9999px',
      background: 'var(--color-surface)',
      color: 'var(--color-foreground)',
      boxShadow: '0 0 0 1px var(--color-border), 0 1px 3px rgb(0 0 0 / 0.18)',
      font: '600 12px/1 var(--font-sans)',
      fontVariantNumeric: 'tabular-nums',
    })
    return new google.maps.marker.AdvancedMarkerElement({ position, content: disc, zIndex: 1000 + count })
  },
}

let clustering: ClustererOptions | null = null

/**
 * Grouped only when zoomed out: from the street level up, where entrances are added one by one, each shows alone.
 * Built on first use, in the browser, and kept: the clusterer is rebuilt whenever its options change.
 */
export function editorClustering(): ClustererOptions {
  clustering ??= { renderer, algorithm: new SuperClusterAlgorithm({ maxZoom: 15, radius: 60 }) }
  return clustering
}
