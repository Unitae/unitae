import { MAP_ATTRIBUTION } from '@unitae/tokens/map-style'
import { MapAttribution, MapControls, MapPin } from '@unitae/ui'
import { Map as MapLibreMap, Marker, useMap } from '@vis.gl/react-maplibre'
import { useEffect, useMemo, useRef } from 'react'

import type { Bbox } from '~/features/territories/model/bbox.type'
import { tileFailed, useBaseStyle } from '~/features/territories/ui/map/maplibre-base'
import * as m from '~/i18n/paraglide/messages'

// The territory's map itself, on MapLibre: loaded only in the browser, as its own chunk. Our pins, our controls, our
// quiet base, tiles and glyphs served by the instance (map/maplibre-base). The frame around it (caption, loading and
// failure, the entrance card) is HolderTerritoryMap's.

export interface HolderMapPin {
  key: string
  entranceId: number
  number: string
  label: string
  lat: number
  lng: number
}

type LngLatBounds = [[number, number], [number, number]]

const PADDING = 48
const MAX_FIT_ZOOM = 17

function boundsOf(pins: HolderMapPin[]): LngLatBounds {
  const lngs = pins.map(pin => pin.lng)
  const lats = pins.map(pin => pin.lat)
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ]
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
  const style = useBaseStyle(tiles)
  const bounds = useMemo(() => boundsOf(pins), [pins])
  const ready = useRef(false)

  return (
    <>
      <MapLibreMap
        mapStyle={style}
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
