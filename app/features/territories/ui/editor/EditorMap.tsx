import { MapStatus } from '@unitae/ui'
import { lazy, type ReactNode, Suspense, useEffect, useState } from 'react'

import type { BaseMap } from '~/features/territories/model/base-map.type'
import type { Draft } from '~/features/territories/model/territory-draft'
import { MAPLIBRE_WORKER_URL } from '~/features/territories/ui/holder-map-chunk'
import type { Bbox } from '~/features/territories/ui/map/use-bbox-entrances'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { cn } from '~/shared/utils/utils'
import type { MapEntrance } from './editor-map-entrance'

// MapLibre is heavy and needs the browser: the map comes as its own chunk, asked for as soon as this module runs in
// the browser, and drawn once the page has hydrated. The frame (status, the picked entrance's card) is drawn here.
const loadCanvas = () => import('./EditorMapCanvas')
if (typeof window !== 'undefined') loadCanvas().catch(() => undefined)
const EditorMapCanvas = lazy(loadCanvas)

export interface EditorMapFocus {
  id: number
  nonce: number
}

/** What the map draws and reports, beyond the frame's own props. */
export interface EditorMapLayerProps {
  bboxUrl: (bbox: Bbox) => string
  /** Bumped when what the zones hold changes (another type while creating): they are fetched again. */
  refreshKey: number
  /** The territory's own entrances that have a position. */
  own: MapEntrance[]
  draft: Draft
  /** Where to open when the territory has no placed entrance. */
  center: { lat: number; lng: number } | null
  selectedId: number | null
  hotId: number | null
  /** A row picked in the list: the map goes to its entrance. */
  focus: EditorMapFocus | null
  hint: string | null
  legend: ReactNode
  /** The split tool: how many free entrances there are in all, for « 42 sur 412 visibles ici ». */
  visibleOf?: number
  onSelect: (entrance: MapEntrance) => void
  onHover: (id: number | null) => void
}

interface EditorMapProps extends EditorMapLayerProps {
  /** The instance's base map and the congregation's area. */
  map: BaseMap
  label: string
  card: ReactNode
  className?: string
}

type MapState = 'loading' | 'ready' | 'failed'

/**
 * The editor's map: the territory's entrances, the free ones and those of the other territories of its type, loaded
 * by zone as it moves; the territory's outline; our zoom, « Recentrer » and address search; the picked entrance's card.
 */
export function EditorMap({ map, label, card, className, ...layer }: EditorMapProps) {
  const [state, setState] = useState<MapState>('loading')
  const [attempt, setAttempt] = useState(0)
  const [inBrowser, setInBrowser] = useState(false)
  useEffect(() => setInBrowser(true), [])

  return (
    <section aria-label={label} className={cn('relative overflow-hidden bg-subtle', className)}>
      {/* The worker MapLibre starts once its chunk runs: fetched now, it comes from the cache then. */}
      <link rel="prefetch" href={MAPLIBRE_WORKER_URL} />
      {inBrowser && (
        <Suspense fallback={null}>
          <EditorMapCanvas
            key={attempt}
            tiles={map.tiles}
            area={map.area}
            {...layer}
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
      <div aria-live="polite">{card}</div>
    </section>
  )
}
