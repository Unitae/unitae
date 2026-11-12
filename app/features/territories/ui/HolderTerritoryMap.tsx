import { MapCaption, MapStatus } from '@unitae/ui'
import { type CSSProperties, lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import type { Bbox } from '~/features/territories/model/bbox.type'
import type { HolderEntrance } from '~/features/territories/model/holder-territory'
import { HolderEntranceCard } from '~/features/territories/ui/HolderEntranceCard'
import { loadHolderMapCanvas, MAPLIBRE_WORKER_URL } from '~/features/territories/ui/holder-map-chunk'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { cn } from '~/shared/utils/utils'

// MapLibre is heavy and needs the browser: it comes as its own chunk, asked for as soon as this module runs in the
// browser — alongside the page's own code, not after hydration — and rendered once the page has hydrated.
if (typeof window !== 'undefined') loadHolderMapCanvas().catch(() => undefined)
const HolderMapCanvas = lazy(loadHolderMapCanvas)

// Beside the list on a wide screen. Alone on a phone, it takes the height left under the page's header, less
// the bottom padding the layout keeps for the tab bar (AppLayout: 4.5rem below md, 1.5rem above), so the page
// never scrolls and one finger moves the map.
const SIDE = 'h-[60vh] max-h-[720px] xl:h-[calc(100vh-10rem)]'
const FILL =
  'h-[calc(100dvh-var(--map-top,16rem)-4.5rem-env(safe-area-inset-bottom))] min-h-72 md:h-[calc(100dvh-var(--map-top,16rem)-1.5rem)]'

type MapState = 'loading' | 'ready' | 'failed'

interface HolderTerritoryMapProps {
  /** Tile address template of the instance's base map. */
  tiles: string
  /** The congregation's area: the map stays within it. */
  area: Bbox
  number: string
  entrances: HolderEntrance[]
  territoryType: string
  showPhone: boolean
  hoveredId: number | null
  selectedId: number | null
  onHover: (id: number | null) => void
  onSelect: (id: number) => void
  onClose: () => void
  onShowInList: (id: number) => void
  /** The map alone on a phone's screen: as tall as what is left, moved with one finger. */
  fillScreen: boolean
}

/** The territory's buildings on a map, each pin carrying the number the list shows, linked to the list. */
export function HolderTerritoryMap({
  tiles,
  area,
  number,
  entrances,
  territoryType,
  showPhone,
  hoveredId,
  selectedId,
  onHover,
  onSelect,
  onClose,
  onShowInList,
  fillScreen,
}: HolderTerritoryMapProps) {
  const { ref, top } = useMapTop(fillScreen)
  const [state, setState] = useState<MapState>('loading')
  const [attempt, setAttempt] = useState(0)
  const [inBrowser, setInBrowser] = useState(false)
  useEffect(() => setInBrowser(true), [])

  const pins = useMemo(
    () =>
      entrances.flatMap(entrance =>
        entrance.points.map((point, index) => ({
          ...point,
          key: `${entrance.id}-${index}`,
          entranceId: entrance.id,
          label: `${point.number} ${entrance.street}`,
        })),
      ),
    [entrances],
  )

  if (pins.length === 0) return null
  const selected = entrances.find(entrance => entrance.id === selectedId) ?? null

  return (
    <section
      ref={ref}
      aria-label={m.my_territories_map_label({ number })}
      style={top == null ? undefined : ({ '--map-top': `${top}px` } as CSSProperties)}
      className={cn('border-border bg-subtle relative overflow-hidden rounded-lg border', fillScreen ? FILL : SIDE)}
    >
      {/* The worker MapLibre starts once its chunk runs: fetched now, it comes from the cache then. */}
      <link rel="prefetch" href={MAPLIBRE_WORKER_URL} />
      {inBrowser && (
        <Suspense fallback={null}>
          <HolderMapCanvas
            key={attempt}
            tiles={tiles}
            area={area}
            pins={pins}
            hoveredId={hoveredId}
            selectedId={selectedId}
            selectedPoint={selected?.points[0] ?? null}
            onHover={onHover}
            onSelect={onSelect}
            onReady={() => setState('ready')}
            onFail={() => setState('failed')}
          />
        </Suspense>
      )}

      <MapCaption>{m.my_territories_map_caption()}</MapCaption>
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
      <div aria-live="polite">
        {selected != null && (
          <HolderEntranceCard
            key={selected.id}
            entrance={selected}
            territoryType={territoryType}
            showPhone={showPhone}
            onClose={onClose}
            onShowInList={() => onShowInList(selected.id)}
          />
        )}
      </div>
    </section>
  )
}

/** Where the map starts on the page, measured from the top while it fills a phone's screen. */
function useMapTop(active: boolean) {
  const ref = useRef<HTMLElement>(null)
  const [top, setTop] = useState<number | null>(null)
  useLayoutEffect(() => {
    if (!active) return
    const measure = () => {
      if (ref.current != null) setTop(ref.current.getBoundingClientRect().top + window.scrollY)
    }
    window.scrollTo(0, 0)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [active])
  return { ref, top }
}
