import { MAP_ATTRIBUTION } from '@unitae/tokens/map-style'
import { MapAttribution, MapCluster, MapControls } from '@unitae/ui'
import { Map as MapLibreMap, type MapRef, Marker, useMap } from '@vis.gl/react-maplibre'
import { Info, Loader2, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { Bbox } from '~/features/territories/model/bbox.type'
import { pinState } from '~/features/territories/model/territory-draft'
import { territoryOutline } from '~/features/territories/model/territory-outline'
import MapSearchBox from '~/features/territories/ui/MapSearchBox'
import { tileFailed, useBaseStyle } from '~/features/territories/ui/map/maplibre-base'
import { useBboxEntrances } from '~/features/territories/ui/map/use-bbox-entrances'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { cn } from '~/shared/utils/utils'
import type { EditorMapLayerProps } from './EditorMap'
import { clusterIndex } from './editor-clusters'
import { entrancesCount } from './editor-labels'
import type { MapEntrance } from './editor-map-entrance'
import { EntranceMarker, OutlineLayer } from './editor-map-layers'

// The editor's map itself, on MapLibre: loaded only in the browser, as its own chunk. Its frame (status, the picked
// entrance's card) is EditorMap's.

/** Keeps the outermost entrances off the map's edges. */
const MARGIN = 0.0008
/** The smallest area the map opens on, in degrees: a few streets. */
const MIN_SPAN = 0.004
/** Where the map opens on the congregation when the territory has no placed entrance: a few streets around. */
const START_ZOOM = 14
/** From this zoom on every entrance shows alone (editor-clusters). */
const STREET_ZOOM = 15
/** A row picked in the list: the map comes this close, unless it already shows the street. */
const FOCUS_ZOOM = 16
const CHIP =
  'pointer-events-auto inline-flex items-center gap-1.5 rounded-md bg-surface px-2 py-1 text-xs shadow-md ring-1 ring-border'

type LngLatBounds = [[number, number], [number, number]]
type Opening = { bounds: LngLatBounds } | { longitude: number; latitude: number; zoom: number }

interface EditorMapCanvasProps extends EditorMapLayerProps {
  tiles: string
  area: Bbox
  onReady: () => void
  onFail: () => void
}

export default function EditorMapCanvas({ tiles, area, onReady, onFail, ...layer }: EditorMapCanvasProps) {
  const style = useBaseStyle(tiles)
  const ready = useRef(false)
  const { own, center } = layer
  const opening = useMemo(() => openingOf(own, center, area), [own, center, area])

  return (
    <>
      <MapLibreMap
        mapStyle={style}
        initialViewState={opening}
        maxBounds={[area.swLng, area.swLat, area.neLng, area.neLat]}
        dragRotate={false}
        pitchWithRotate={false}
        touchPitch={false}
        attributionControl={false}
        style={{ position: 'absolute', inset: 0 }}
        onLoad={event => event.target.touchZoomRotate.disableRotation()}
        onIdle={() => {
          if (ready.current) return
          ready.current = true
          onReady()
        }}
        onError={event => {
          if (tileFailed(event)) onFail()
        }}
      >
        <EditorLayer {...layer} opening={opening} />
      </MapLibreMap>
      <MapAttribution sources={MAP_ATTRIBUTION} />
    </>
  )
}

function EditorLayer({
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
  opening,
}: EditorMapLayerProps & { opening: Opening }) {
  const { current: map } = useMap()
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

  const index = useMemo(() => clusterIndex(entrances), [entrances])
  const view = useMapView()
  const items = useMemo(() => (view == null ? [] : index.itemsIn(view.bounds, view.zoom)), [index, view])

  // A row picked in the list moves the map; the entrances changing under it afterwards must not.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the focus request alone triggers it
  useEffect(() => {
    if (focus == null || map == null) return
    const entrance = entrances.find(candidate => candidate.id === focus.id)
    if (entrance?.latitude == null || entrance.longitude == null) return
    const zoom = map.getZoom()
    map.easeTo({ center: [entrance.longitude, entrance.latitude], zoom: zoom < STREET_ZOOM ? FOCUS_ZOOM : zoom })
  }, [focus, map])

  const goTo = (id: number) => {
    const entrance = entrances.find(candidate => candidate.id === id)
    if (entrance == null) return
    onSelect(entrance)
    if (entrance.latitude != null && entrance.longitude != null) map?.panTo([entrance.longitude, entrance.latitude])
  }

  return (
    <>
      <OutlineLayer points={outline} />
      {items.map(item =>
        item.kind === 'cluster' ? (
          <Marker key={`cluster-${item.id}`} longitude={item.lng} latitude={item.lat} style={{ zIndex: 4 }}>
            <MapCluster
              count={item.count}
              label={entrancesCount(item.count)}
              onSelect={() => map?.easeTo({ center: [item.lng, item.lat], zoom: index.expansionZoom(item.id) })}
            />
          </Marker>
        ) : (
          <EntranceMarker
            key={item.entrance.id}
            entrance={item.entrance}
            state={pinState(item.entrance.id, item.entrance.standing, draft)}
            selected={item.entrance.id === selectedId}
            hot={item.entrance.id === hotId}
            onSelect={onSelect}
            onHover={onHover}
          />
        ),
      )}
      <MapControls
        labels={{
          zoomIn: m.my_territories_map_zoom_in(),
          zoomOut: m.my_territories_map_zoom_out(),
          recenter: m.my_territories_map_recenter(),
        }}
        onZoomIn={() => map?.zoomIn()}
        onZoomOut={() => map?.zoomOut()}
        onRecenter={() => {
          if ('bounds' in opening) map?.fitBounds(opening.bounds)
          else map?.easeTo({ center: [opening.longitude, opening.latitude], zoom: opening.zoom })
        }}
      />

      <div className="pointer-events-none absolute top-3 left-3 z-10 flex max-w-[calc(100%-5rem)] flex-col items-start gap-2">
        <MapSearchBox candidates={entrances} onSelect={goTo} />
        {hint != null && (
          <span className="rounded-md bg-foreground px-2.5 py-1.5 text-background text-xs shadow-md">{hint}</span>
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
      {/* The key to the dots at every width, with how many entrances the view shows, as the boards place it. */}
      <div className="pointer-events-none absolute bottom-7 left-3 z-[5] flex max-w-[calc(100%-1.5rem)] flex-wrap items-end gap-2">
        {legend}
        {visibleOf != null && !zone.loading && (
          <span className={cn(CHIP, 'text-muted-foreground tabular-nums')}>
            {m.split_tool_visible_here({
              visible: new Intl.NumberFormat(getLocale()).format(zone.viewportEntrances.length),
              total: new Intl.NumberFormat(getLocale()).format(visibleOf),
            })}
          </span>
        )}
      </div>
    </>
  )
}

/** The view to group entrances for: what shows, plus half again around it so a short drag finds them drawn. */
function useMapView() {
  const { current: map } = useMap()
  const [view, setView] = useState<{ bounds: [number, number, number, number]; zoom: number } | null>(null)
  useEffect(() => {
    if (map == null) return
    const update = () => setView(viewOf(map))
    update()
    map.on('moveend', update)
    return () => {
      map.off('moveend', update)
    }
  }, [map])
  return view
}

function viewOf(map: MapRef): { bounds: [number, number, number, number]; zoom: number } {
  const bounds = map.getBounds()
  const padLng = (bounds.getEast() - bounds.getWest()) / 2
  const padLat = (bounds.getNorth() - bounds.getSouth()) / 2
  return {
    bounds: [
      Math.max(-180, bounds.getWest() - padLng),
      Math.max(-85, bounds.getSouth() - padLat),
      Math.min(180, bounds.getEast() + padLng),
      Math.min(85, bounds.getNorth() + padLat),
    ],
    zoom: map.getZoom(),
  }
}

/** Where the map opens: around the territory's entrances, else on the congregation's, else on its whole area. */
function openingOf(own: MapEntrance[], center: { lat: number; lng: number } | null, area: Bbox): Opening {
  const placed = own.flatMap(entrance =>
    entrance.latitude == null || entrance.longitude == null
      ? []
      : [{ lat: entrance.latitude, lng: entrance.longitude }],
  )
  if (placed.length > 0) return { bounds: boundsOf(placed) }
  if (center != null) return { longitude: center.lng, latitude: center.lat, zoom: START_ZOOM }
  return {
    bounds: [
      [area.swLng, area.swLat],
      [area.neLng, area.neLat],
    ],
  }
}

/** Around the points, with at least a few streets: one entrance alone would open at the closest zoom. */
function boundsOf(points: readonly { lat: number; lng: number }[]): LngLatBounds {
  const lats = points.map(point => point.lat)
  const lngs = points.map(point => point.lng)
  const pad = (low: number, high: number) => Math.max(MARGIN, (MIN_SPAN - (high - low)) / 2)
  const [south, north] = [Math.min(...lats), Math.max(...lats)]
  const [west, east] = [Math.min(...lngs), Math.max(...lngs)]
  return [
    [west - pad(west, east), south - pad(south, north)],
    [east + pad(west, east), north + pad(south, north)],
  ]
}
