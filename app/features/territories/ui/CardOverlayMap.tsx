import { MapStatus } from '@unitae/ui'
import { lazy, Suspense, useEffect, useState } from 'react'

import type { BaseMap } from '~/features/territories/model/base-map.type'
import type { Bbox } from '~/features/territories/model/bbox.type'
import type { CardOverlay, CardOverlayPath } from '~/features/territories/model/card-overlay'
import { MAPLIBRE_WORKER_URL } from '~/features/territories/ui/holder-map-chunk'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { cn } from '~/shared/utils/utils'

// The map of Réglages › Carte de l'assemblée: the zones and the perimeter on the instance's base map, drawn and
// reshaped with terra-draw. MapLibre comes as its own chunk, asked for once this frame renders (the module is
// re-exported by the feature's barrel, so it must not fetch anything by itself).
const CardOverlayMapCanvas = lazy(() => import('./CardOverlayMapCanvas'))

export interface CardOverlayMapProps {
  /** The base map's tiles, and how far the map goes: the congregation's area and some ten kilometres around it. */
  map: BaseMap
  /** The congregation's area: where the map opens without any shape, and « Recentrer sur l'assemblée » without one. */
  home: Bbox
  overlays: CardOverlay[]
  /** The zone being reshaped: hidden, terra-draw draws it. */
  excludeOverlayId?: number | null
  perimeter?: CardOverlayPath[] | null
  /** The perimeter is being reshaped: hidden, terra-draw draws it. */
  excludePerimeter?: boolean
  drawingEnabled: boolean
  draftPaths: CardOverlayPath[] | null
  draftColor: string
  onDraftChange: (paths: CardOverlayPath[]) => void
  className?: string
}

type MapState = 'loading' | 'ready' | 'failed'

export default function CardOverlayMap({ className, ...props }: CardOverlayMapProps) {
  const [state, setState] = useState<MapState>('loading')
  const [attempt, setAttempt] = useState(0)
  const [inBrowser, setInBrowser] = useState(false)
  useEffect(() => setInBrowser(true), [])

  return (
    <section aria-label={m.settings_map_label()} className={cn('relative overflow-hidden bg-subtle', className)}>
      {/* The worker MapLibre starts once its chunk runs: fetched now, it comes from the cache then. */}
      <link rel="prefetch" href={MAPLIBRE_WORKER_URL} />
      {inBrowser && (
        <Suspense fallback={null}>
          <CardOverlayMapCanvas
            key={attempt}
            {...props}
            onReady={() => setState('ready')}
            onFail={() => setState('failed')}
          />
        </Suspense>
      )}
      {state === 'loading' && <MapStatus tone="loading">{m.my_territories_map_loading()}</MapStatus>}
      {state === 'failed' && (
        <MapStatus
          tone="error"
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setState('loading')
                setAttempt(previous => previous + 1)
              }}
            >
              {m.my_territories_map_retry()}
            </Button>
          }
        >
          {m.my_territories_map_unavailable()}
        </MapStatus>
      )}
    </section>
  )
}
