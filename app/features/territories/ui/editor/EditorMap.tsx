import { hexColors } from '@unitae/tokens'
import {
  AdvancedMarker,
  Map as GoogleMap,
  APIProvider as GoogleMapApiProvider,
  useMap,
} from '@vis.gl/react-google-maps'
import { Info, Loader2, RefreshCw } from 'lucide-react'
import { type ReactNode, useEffect, useMemo } from 'react'

import { type Draft, pinState } from '~/features/territories/model/territory-draft'
import { territoryOutline } from '~/features/territories/model/territory-outline'
import { HolderMapControls } from '~/features/territories/ui/HolderMapControls'
import MapSearchBox from '~/features/territories/ui/MapSearchBox'
import { type Bbox, useBboxEntrances } from '~/features/territories/ui/map/use-bbox-entrances'
import { useMarkerClusterer } from '~/features/territories/ui/use-marker-clusterer'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import MapConsentBanner, { useMapConsent } from '~/shared/ui/MapConsentBanner'
import { cn } from '~/shared/utils/utils'
import { EditorPin } from './EditorPin'
import { editorClustering } from './editor-cluster'
import { addressOf } from './editor-labels'
import type { MapEntrance } from './editor-map-entrance'

/** Keeps the outermost entrances off the map's edges. */
const MARGIN = 0.0008
/** The smallest area the map opens on, in degrees: a few streets. */
const MIN_SPAN = 0.004
const CHIP =
  'pointer-events-auto inline-flex items-center gap-1.5 rounded-md bg-surface px-2 py-1 text-xs shadow-md ring-1 ring-border'

export interface EditorMapFocus {
  id: number
  nonce: number
}

interface EditorMapProps {
  apiKey: string
  label: string
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
  card: ReactNode
  /** The split tool: how many free entrances there are in all, for « 42 sur 412 visibles ici ». */
  visibleOf?: number
  onSelect: (entrance: MapEntrance) => void
  onHover: (id: number | null) => void
  className?: string
}

/**
 * The editor's map: the territory's entrances, the free ones and those of the other territories of its type, loaded
 * by zone as it moves; the territory's outline; our zoom, « Recentrer » and address search; the picked entrance's card.
 */
export function EditorMap(props: EditorMapProps) {
  const { apiKey, label, own, center, className } = props
  const { consented, grantConsent } = useMapConsent()
  const bounds = useMemo(() => {
    const points = own.map(entrance => ({ lat: entrance.latitude ?? 0, lng: entrance.longitude ?? 0 }))
    return boundsOf(points.length > 0 ? points : center != null ? [center] : [])
  }, [own, center])

  if (!consented) {
    return (
      <div className={cn('grid place-content-center bg-subtle p-4', className)}>
        <MapConsentBanner onAccept={grantConsent} />
      </div>
    )
  }

  return (
    <section aria-label={label} className={cn('relative overflow-hidden bg-subtle', className)}>
      <GoogleMapApiProvider apiKey={apiKey}>
        <GoogleMap
          mapId="unitae-territory-edit"
          {...mapStart(own.length > 0, bounds, center)}
          className="size-full"
          disableDefaultUI={true}
          // The map's own places would open Google's bubbles over the editor's card.
          clickableIcons={false}
          keyboardShortcuts={true}
          gestureHandling="greedy"
        >
          <MapLayer {...props} />
        </GoogleMap>
        <HolderMapControls bounds={bounds} />
      </GoogleMapApiProvider>
      <div aria-live="polite">{props.card}</div>
    </section>
  )
}

/** Where the map opens: around the territory's entrances, else the congregation's, else the whole world. */
function mapStart(
  placed: boolean,
  bounds: google.maps.LatLngBoundsLiteral,
  center: { lat: number; lng: number } | null,
) {
  if (placed) return { defaultBounds: bounds }
  if (center != null) return { defaultCenter: center, defaultZoom: 15 }
  return { defaultCenter: { lat: 20, lng: 0 }, defaultZoom: 2 }
}

function MapLayer({
  bboxUrl,
  refreshKey,
  own,
  draft,
  selectedId,
  hotId,
  focus,
  hint,
  legend,
  visibleOf,
  onSelect,
  onHover,
}: EditorMapProps) {
  const map = useMap()
  const markerRef = useMarkerClusterer(map, editorClustering())
  const invalidateOnIds = useMemo(() => [...draft.keys()], [draft])
  const zone = useBboxEntrances({ buildUrl: bboxUrl, invalidateOnIds, refreshKey })

  // What the zone shows, then the territory's own entrances, then the changed ones even out of the zone.
  const entrances = useMemo(() => {
    const byId = new Map<number, MapEntrance>()
    for (const entrance of zone.viewportEntrances) {
      byId.set(entrance.id, { ...entrance, standing: entrance.status, otherTerritory: entrance.otherTerritory })
    }
    for (const entrance of own) byId.set(entrance.id, entrance)
    for (const change of draft.values()) {
      if (byId.has(change.entrance.id) || change.entrance.latitude == null) continue
      byId.set(change.entrance.id, { ...change.entrance, standing: 'available', otherTerritory: null })
    }
    return [...byId.values()]
  }, [zone.viewportEntrances, own, draft])

  const outline = useMemo(() => {
    const kept = entrances.filter(entrance => {
      const state = pinState(entrance.id, entrance.standing, draft)
      return state === 'in' || state === 'add'
    })
    return territoryOutline(kept.map(entrance => ({ lat: entrance.latitude ?? 0, lng: entrance.longitude ?? 0 })))
  }, [entrances, draft])

  // A row picked in the list moves the map; the entrances changing under it afterwards must not.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the focus request alone triggers it
  useEffect(() => {
    if (focus == null || map == null) return
    const entrance = entrances.find(candidate => candidate.id === focus.id)
    if (entrance?.latitude == null || entrance.longitude == null) return
    map.panTo({ lat: entrance.latitude, lng: entrance.longitude })
    if ((map.getZoom() ?? 0) < 16) map.setZoom(17)
  }, [focus, map])

  return (
    <>
      {entrances.map(entrance => {
        if (entrance.latitude == null || entrance.longitude == null) return null
        const state = pinState(entrance.id, entrance.standing, draft)
        const selected = entrance.id === selectedId
        const hot = entrance.id === hotId
        return (
          <AdvancedMarker
            key={entrance.id}
            ref={markerRef(entrance.id)}
            position={{ lat: entrance.latitude, lng: entrance.longitude }}
            title={pinLabel(entrance, state)}
            zIndex={selected ? 3 : hot ? 2 : 1}
            onClick={() => onSelect(entrance)}
            onMouseEnter={() => onHover(entrance.id)}
            onMouseLeave={() => onHover(null)}
          >
            <span
              className={cn(
                'relative grid place-content-center transition-transform duration-(--u-duration-fast) before:absolute before:-inset-1.5 max-xl:before:-inset-3',
                hot && 'scale-120',
                selected && 'scale-125 rounded-full outline-2 outline-foreground outline-offset-3',
              )}
            >
              <EditorPin state={state} />
            </span>
          </AdvancedMarker>
        )
      })}
      <OutlinePolygon points={outline} />

      <div className="pointer-events-none absolute top-3 left-3 z-10 flex max-w-[calc(100%-5rem)] flex-col items-start gap-2">
        <MapSearchBox candidates={entrances} onSelect={id => onSelectById(entrances, id, onSelect, map)} />
        {hint != null && (
          <span className="rounded-md bg-foreground px-2.5 py-1.5 text-background text-xs shadow-md">{hint}</span>
        )}
        {visibleOf != null && !zone.loading && (
          <span className={cn(CHIP, 'text-muted-foreground tabular-nums')}>
            {m.split_tool_visible_here({
              visible: new Intl.NumberFormat(getLocale()).format(zone.viewportEntrances.length),
              total: new Intl.NumberFormat(getLocale()).format(visibleOf),
            })}
          </span>
        )}
        {zone.loading && (
          <span role="status" className={cn(CHIP, 'text-muted-foreground')}>
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            {m.territories_map_loading()}
          </span>
        )}
        {zone.truncated && (
          <span className={cn(CHIP, 'text-muted-foreground')}>
            <Info className="size-3" aria-hidden="true" />
            {zone.truncatedTotal != null
              ? m.territories_map_truncated_hint_with_count({ total: String(zone.truncatedTotal) })
              : m.territories_map_truncated_hint()}
          </span>
        )}
        {zone.error && (
          <button type="button" onClick={zone.retryLastLoad} className={cn(CHIP, 'text-destructive hover:bg-hover')}>
            <RefreshCw className="size-3" aria-hidden="true" />
            {m.territories_map_load_error()}
          </button>
        )}
      </div>
      <div className="pointer-events-none absolute bottom-7 left-3 z-[5] max-xl:hidden">{legend}</div>
    </>
  )
}

function onSelectById(
  entrances: MapEntrance[],
  id: number,
  onSelect: (entrance: MapEntrance) => void,
  map: google.maps.Map | null,
) {
  const entrance = entrances.find(candidate => candidate.id === id)
  if (entrance == null) return
  onSelect(entrance)
  if (map != null && entrance.latitude != null && entrance.longitude != null) {
    map.panTo({ lat: entrance.latitude, lng: entrance.longitude })
  }
}

function pinLabel(entrance: MapEntrance, state: ReturnType<typeof pinState>): string {
  const address = addressOf(entrance)
  if (state === 'in') return m.territory_editor_pin_in({ address })
  if (state === 'free') return m.territory_editor_pin_free({ address })
  if (state === 'add') return m.territory_editor_pin_added({ address })
  if (state === 'remove') return m.territory_editor_pin_removed({ address })
  return m.territory_editor_pin_other({ address })
}

/** The territory's outline, drawn by the map under the pins. */
function OutlinePolygon({ points }: { points: { lat: number; lng: number }[] }) {
  const map = useMap()
  useEffect(() => {
    if (map == null || points.length < 3) return
    const accent = hexColors.light.accent
    const polygon = new google.maps.Polygon({
      map,
      paths: points,
      clickable: false,
      strokeColor: accent,
      strokeOpacity: 0.8,
      strokeWeight: 1.5,
      fillColor: accent,
      fillOpacity: 0.06,
      zIndex: 0,
    })
    return () => polygon.setMap(null)
  }, [map, points])
  return null
}

function boundsOf(points: readonly { lat: number; lng: number }[]): google.maps.LatLngBoundsLiteral {
  const lats = points.map(point => point.lat)
  const lngs = points.map(point => point.lng)
  if (points.length === 0) return { north: MARGIN, south: -MARGIN, east: MARGIN, west: -MARGIN }
  // At least a few streets around: one entrance alone would open at the closest zoom.
  const pad = (low: number, high: number) => Math.max(MARGIN, (MIN_SPAN - (high - low)) / 2)
  const [south, north] = [Math.min(...lats), Math.max(...lats)]
  const [west, east] = [Math.min(...lngs), Math.max(...lngs)]
  return {
    north: north + pad(south, north),
    south: south - pad(south, north),
    east: east + pad(west, east),
    west: west - pad(west, east),
  }
}
