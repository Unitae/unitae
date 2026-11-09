import { AdvancedMarker, Map as GoogleMap, APIProvider as GoogleMapApiProvider } from '@vis.gl/react-google-maps'
import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import type { HolderEntrance } from '~/features/territories/model/holder-territory'
import { HolderEntranceCard } from '~/features/territories/ui/HolderEntranceCard'
import { FollowSelection, HolderMapControls } from '~/features/territories/ui/HolderMapControls'
import * as m from '~/i18n/paraglide/messages'
import MapConsentBanner, { useMapConsent } from '~/shared/ui/MapConsentBanner'
import { cn } from '~/shared/utils/utils'

/** Keeps the outermost pins off the map's edges. */
const BOUNDS_MARGIN = 0.0008

// A pin carries the number the list shows; on a phone its touch area reaches 44 px.
const PIN =
  'relative flex h-5.5 min-w-6 origin-bottom items-center justify-center rounded-full bg-primary px-1.5 font-semibold text-[11px] text-primary-foreground tabular-nums shadow-sm ring-2 ring-surface transition-transform max-xl:before:absolute max-xl:before:-inset-x-2.5 max-xl:before:-inset-y-3'
const PIN_HOVERED = 'scale-115 ring-primary ring-offset-2 ring-offset-surface'
const PIN_SELECTED = 'scale-115 bg-foreground text-background'

// Beside the list on a wide screen. Alone on a phone, it takes the height left under the page's header, less
// the bottom padding the layout keeps for the tab bar (AppLayout: 4.5rem below md, 1.5rem above), so the page
// never scrolls and one finger moves the map.
const SIDE = 'h-[60vh] max-h-[720px] xl:h-[calc(100vh-10rem)]'
const FILL =
  'h-[calc(100dvh-var(--map-top,16rem)-4.5rem-env(safe-area-inset-bottom))] min-h-72 md:h-[calc(100dvh-var(--map-top,16rem)-1.5rem)]'

interface HolderTerritoryMapProps {
  apiKey: string
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
  apiKey,
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
  const { consented, grantConsent } = useMapConsent()
  const { ref, top } = useMapTop(fillScreen && consented)
  const [loaded, setLoaded] = useState(false)
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
  const bounds = useMemo(() => boundsOf(pins), [pins])

  // Escape closes the card, as it would a popover.
  useEffect(() => {
    if (selectedId == null) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [selectedId, onClose])

  if (!consented) return <MapConsentBanner onAccept={grantConsent} />
  if (pins.length === 0) return null

  const selected = entrances.find(entrance => entrance.id === selectedId) ?? null

  return (
    <section
      ref={ref}
      aria-label={m.my_territories_map_label({ number })}
      style={top == null ? undefined : ({ '--map-top': `${top}px` } as CSSProperties)}
      className={cn('relative overflow-hidden rounded-lg border border-border', fillScreen ? FILL : SIDE)}
    >
      <GoogleMapApiProvider apiKey={apiKey}>
        <GoogleMap
          mapId="unitae-territory-display"
          defaultBounds={bounds}
          className="size-full"
          disableDefaultUI={true}
          gestureHandling={fillScreen ? 'greedy' : 'auto'}
          onIdle={() => setLoaded(true)}
        >
          {pins.map(pin => {
            const isSelected = pin.entranceId === selectedId
            const isHovered = pin.entranceId === hoveredId
            return (
              <AdvancedMarker
                key={pin.key}
                position={{ lat: pin.lat, lng: pin.lng }}
                title={pin.label}
                zIndex={isSelected ? 3 : isHovered ? 2 : 1}
                onClick={() => onSelect(pin.entranceId)}
                onMouseEnter={() => onHover(pin.entranceId)}
                onMouseLeave={() => onHover(null)}
              >
                <span className={cn(PIN, isSelected ? PIN_SELECTED : isHovered && PIN_HOVERED)}>{pin.number}</span>
              </AdvancedMarker>
            )
          })}
        </GoogleMap>
        <HolderMapControls bounds={bounds} />
        <FollowSelection position={selected?.points[0] ?? null} />
      </GoogleMapApiProvider>

      <span className="pointer-events-none absolute top-3 left-3 z-10 max-w-[calc(100%-5rem)] rounded-md bg-surface px-2 py-1 text-muted-foreground text-xs shadow-md ring-1 ring-border">
        {m.my_territories_map_caption()}
      </span>
      {!loaded && (
        <span
          role="status"
          className="pointer-events-none absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-md bg-surface px-3 py-1.5 text-muted-foreground text-sm shadow-md ring-1 ring-border"
        >
          {m.my_territories_map_loading()}
        </span>
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

function boundsOf(points: { lat: number; lng: number }[]): google.maps.LatLngBoundsLiteral {
  const lats = points.map(point => point.lat)
  const lngs = points.map(point => point.lng)
  return {
    north: Math.max(...lats) + BOUNDS_MARGIN,
    south: Math.min(...lats) - BOUNDS_MARGIN,
    east: Math.max(...lngs) + BOUNDS_MARGIN,
    west: Math.min(...lngs) - BOUNDS_MARGIN,
  }
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
