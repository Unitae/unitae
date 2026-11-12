import 'maplibre-gl/dist/maplibre-gl.css'

import { MAP_ATTRIBUTION, mapStyle } from '@unitae/tokens/map-style'
import { MapAttribution, MapControls, MapPin } from '@unitae/ui'
import { type ErrorEvent, Map as MapLibreMap, Marker, useMap } from '@vis.gl/react-maplibre'
import { type StyleSpecification, setWorkerUrl } from 'maplibre-gl'
import maplibreWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { useEffect, useMemo, useRef } from 'react'

import type { Bbox } from '~/features/territories/model/bbox.type'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { useDarkMode } from '~/shared/ui/hooks/use-dark-mode'

// The territory's map itself, on MapLibre: loaded only in the browser, as its own chunk. Our pins, our controls, our
// quiet base (`@unitae/tokens/map-style`), tiles and glyphs served by the instance. The frame around it (caption,
// loading and failure, the entrance card) is HolderTerritoryMap's.

export interface HolderMapPin {
  key: string
  entranceId: number
  number: string
  label: string
  lat: number
  lng: number
}

// MapLibre finds its worker next to its own module; bundled, it no longer is. The bundler hands the worker's address.
setWorkerUrl(maplibreWorker)

type LngLatBounds = [[number, number], [number, number]]

const PADDING = 48
const MAX_FIT_ZOOM = 17
const GLYPHS = '/map-fonts/{fontstack}/{range}.pbf'

/** MapLibre wants full addresses; the app gives paths on its own origin. */
const absolute = (path: string) =>
  new URL(path, window.location.origin).href.replaceAll('%7B', '{').replaceAll('%7D', '}')

function boundsOf(pins: HolderMapPin[]): LngLatBounds {
  const lngs = pins.map(pin => pin.lng)
  const lats = pins.map(pin => pin.lat)
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ]
}

/** A base tile the instance failed to serve — not a missing glyph, not an empty tile outside the area. */
function tileFailed(event: ErrorEvent): boolean {
  const error = event.error as Error & { status?: number; url?: string }
  return (
    error.url?.includes('/map/tiles/') === true && (error.status == null || error.status === 0 || error.status >= 500)
  )
}

interface HolderMapCanvasProps {
  tiles: string
  area: Bbox
  pins: HolderMapPin[]
  hoveredId: number | null
  selectedId: number | null
  selectedPoint: { lat: number; lng: number } | null
  onHover: (id: number | null) => void
  onSelect: (id: number) => void
  onReady: () => void
  onFail: () => void
}

export default function HolderMapCanvas({
  tiles,
  area,
  pins,
  hoveredId,
  selectedId,
  selectedPoint,
  onHover,
  onSelect,
  onReady,
  onFail,
}: HolderMapCanvasProps) {
  const dark = useDarkMode()
  const style = useMemo(
    () =>
      mapStyle({ mode: dark ? 'dark' : 'light', tiles: absolute(tiles), glyphs: absolute(GLYPHS), lang: getLocale() }),
    [dark, tiles],
  )
  const bounds = useMemo(() => boundsOf(pins), [pins])
  const ready = useRef(false)

  return (
    <>
      <MapLibreMap
        mapStyle={style as StyleSpecification}
        initialViewState={{ bounds, fitBoundsOptions: { padding: PADDING, maxZoom: MAX_FIT_ZOOM } }}
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
        {pins.map(pin => {
          const isSelected = pin.entranceId === selectedId
          const isHovered = pin.entranceId === hoveredId
          return (
            <Marker
              key={pin.key}
              longitude={pin.lng}
              latitude={pin.lat}
              anchor="bottom"
              style={{ zIndex: isSelected ? 3 : isHovered ? 2 : 1 }}
            >
              <MapPin
                label={pin.label}
                state={isSelected ? 'selected' : isHovered ? 'hovered' : 'idle'}
                onSelect={() => onSelect(pin.entranceId)}
                onHover={hovering => onHover(hovering ? pin.entranceId : null)}
              >
                {pin.number}
              </MapPin>
            </Marker>
          )
        })}
        <Controls bounds={bounds} />
        <FollowSelection point={selectedPoint} />
      </MapLibreMap>
      <MapAttribution sources={MAP_ATTRIBUTION} />
    </>
  )
}

/** Our zoom and « Recentrer », in place of the map's own controls. */
function Controls({ bounds }: { bounds: LngLatBounds }) {
  const { current: map } = useMap()
  return (
    <MapControls
      labels={{
        zoomIn: m.my_territories_map_zoom_in(),
        zoomOut: m.my_territories_map_zoom_out(),
        recenter: m.my_territories_map_recenter(),
      }}
      onZoomIn={() => map?.zoomIn()}
      onZoomOut={() => map?.zoomOut()}
      onRecenter={() => map?.fitBounds(bounds, { padding: PADDING, maxZoom: MAX_FIT_ZOOM })}
    />
  )
}

/** Brings the entrance picked in the list into view when the map has been moved away from it. */
function FollowSelection({ point }: { point: { lat: number; lng: number } | null }) {
  const { current: map } = useMap()
  const lat = point?.lat
  const lng = point?.lng
  useEffect(() => {
    if (map == null || lat == null || lng == null) return
    if (!map.getBounds().contains([lng, lat])) map.panTo([lng, lat])
  }, [map, lat, lng])
  return null
}
