import { hexColors } from '@unitae/tokens'
import { MAP_ATTRIBUTION } from '@unitae/tokens/map-style'
import { MapAttribution, MapControls } from '@unitae/ui'
import { Layer, Map as MapLibreMap, Source, useMap } from '@vis.gl/react-maplibre'
import { Undo2 } from 'lucide-react'
import type { Map as MapLibreGlMap } from 'maplibre-gl'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { TerraDraw, TerraDrawPolygonMode } from 'terra-draw'

import type { Bbox } from '~/features/territories/model/bbox.type'
import type { CardOverlayPath } from '~/features/territories/model/card-overlay'
import { tileFailed, useBaseStyle } from '~/features/territories/ui/map/maplibre-base'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { useDarkMode } from '~/shared/ui/hooks/use-dark-mode'
import type { CardOverlayMapProps } from './CardOverlayMap'
import { onShapeChange, seedPolygon, startDraw } from './card-overlay-draw'

// The zones map itself, on MapLibre: the zones and the perimeter as layers on our base, terra-draw over them for the
// shape being drawn or reshaped, our controls and a line of instructions in the map. Loaded in the browser only.

type LngLatBounds = [[number, number], [number, number]]

/** Room around the shapes when the map fits them, more at the bottom where the line of instructions sits. */
const PADDING = { top: 48, right: 64, bottom: 96, left: 48 }
const MAX_FIT_ZOOM = 16
/** The other shapes fade while one is drawn or reshaped. */
const FADED = 0.35

/** What the layers and terra-draw read: the shapes and the draft. */
type ShapeProps = Omit<CardOverlayMapProps, 'className' | 'map' | 'home'>

interface CanvasProps extends Omit<CardOverlayMapProps, 'className'> {
  onReady: () => void
  onFail: () => void
}

export default function CardOverlayMapCanvas({ map, home, onReady, onFail, ...props }: CanvasProps) {
  const style = useBaseStyle(map.tiles)
  const ready = useRef(false)
  // terra-draw adds its layers to the style: it waits for the map's first style.
  const [loaded, setLoaded] = useState(false)
  // The map opens once on the shapes, else on the area: later shapes don't move it.
  const [opening] = useState(
    () => shapesBounds([props.perimeter ?? [], ...props.overlays.map(overlay => overlay.paths)]) ?? bboxBounds(home),
  )

  return (
    <>
      <MapLibreMap
        mapStyle={style}
        // terra-draw's layers are not in our style: a new style must replace the old one whole, so that `style.load`
        // fires and terra-draw is started again on it, rather than being diffed away.
        styleDiffing={false}
        initialViewState={{ bounds: opening, fitBoundsOptions: { padding: PADDING, maxZoom: MAX_FIT_ZOOM } }}
        maxBounds={[map.area.swLng, map.area.swLat, map.area.neLng, map.area.neLat]}
        dragRotate={false}
        pitchWithRotate={false}
        touchPitch={false}
        doubleClickZoom={false}
        attributionControl={false}
        style={{ position: 'absolute', inset: 0 }}
        onLoad={event => {
          event.target.touchZoomRotate.disableRotation()
          setLoaded(true)
        }}
        onIdle={() => {
          if (ready.current) return
          ready.current = true
          onReady()
        }}
        onError={event => {
          if (tileFailed(event)) onFail()
        }}
      >
        <Shapes {...props} />
        {loaded && <Drawing {...props} />}
        <Recenter home={home} perimeter={props.perimeter ?? null} overlays={props.overlays} />
      </MapLibreMap>
      <MapAttribution sources={MAP_ATTRIBUTION} />
    </>
  )
}

/** The zones (their colour, faded while another shape is worked on) and the perimeter (a dashed line). */
function Shapes({ overlays, excludeOverlayId, perimeter, excludePerimeter, drawingEnabled, draftPaths }: ShapeProps) {
  const dark = useDarkMode()
  const working = drawingEnabled || draftPaths != null
  const zones = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: overlays
        .filter(overlay => overlay.id !== excludeOverlayId && overlay.paths.length >= 3)
        .map(overlay => polygonOf(overlay.paths, { color: overlay.color })),
    }),
    [overlays, excludeOverlayId],
  )
  const outline = useMemo(
    () =>
      perimeter == null || excludePerimeter || perimeter.length < 3
        ? { type: 'FeatureCollection' as const, features: [] }
        : { type: 'FeatureCollection' as const, features: [polygonOf(perimeter, {})] },
    [perimeter, excludePerimeter],
  )
  return (
    <>
      <Source id="card-overlays" type="geojson" data={zones}>
        <Layer
          id="card-overlays-fill"
          type="fill"
          paint={{ 'fill-color': ['get', 'color'], 'fill-opacity': working ? 0.16 * FADED : 0.16 }}
        />
        <Layer
          id="card-overlays-line"
          type="line"
          paint={{ 'line-color': ['get', 'color'], 'line-width': 2, 'line-opacity': working ? FADED : 1 }}
        />
      </Source>
      <Source id="card-perimeter" type="geojson" data={outline}>
        <Layer
          id="card-perimeter-line"
          type="line"
          paint={{
            'line-color': hexColors[dark ? 'dark' : 'light'].fg,
            'line-width': 2,
            'line-opacity': 0.8,
            'line-dasharray': [4, 3],
          }}
        />
      </Source>
    </>
  )
}

/** terra-draw for the shape drawn or reshaped, with its line of instructions. */
function Drawing({ drawingEnabled, draftPaths, draftColor, onDraftChange }: ShapeProps) {
  const { current: mapRef } = useMap()
  const dark = useDarkMode()
  const surface = hexColors[dark ? 'dark' : 'light'].surface
  const drawRef = useRef<{ draw: TerraDraw; polygon: TerraDrawPolygonMode } | null>(null)
  const [mode, setMode] = useState<'polygon' | 'select' | null>(null)
  // Read without restarting terra-draw: the draft moves with every dragged point, and the colour can change while a
  // shape is drawn — restarting would drop the points laid so far. The new colour shows on the next start.
  const draftRef = useRef(draftPaths)
  draftRef.current = draftPaths
  const lookRef = useRef({ color: draftColor, surface })
  lookRef.current = { color: draftColor, surface }

  // biome-ignore lint/correctness/useExhaustiveDependencies: a draft appearing or going (null ↔ shape) restarts it; its points are read from draftRef
  useEffect(() => {
    const map = mapRef?.getMap()
    if (map == null) return
    let unsubscribe: (() => void) | null = null

    const start = () => {
      stop()
      if (!drawingEnabled && draftRef.current == null) return
      let started: ReturnType<typeof startDraw>
      try {
        started = startDraw(map, lookRef.current)
      } catch {
        // A new style is still loading (the page switched theme): `style.load` starts it again.
        return
      }
      drawRef.current = started
      const draft = draftRef.current
      if (draft != null && draft.length >= 3) seedInView(map, started.draw, draft)
      else started.draw.setMode('polygon')
      setMode(started.draw.getMode() === 'polygon' ? 'polygon' : 'select')
      unsubscribe = onShapeChange(
        started.draw,
        () => drawRef.current === started,
        paths => {
          setMode('select')
          onDraftChange(paths)
        },
      )
    }
    const stop = () => {
      unsubscribe?.()
      unsubscribe = null
      try {
        drawRef.current?.draw.stop()
      } catch {
        // A new style already took terra-draw's layers away.
      }
      drawRef.current = null
      setMode(null)
    }

    start()
    // A new style (the page switched to dark or light) comes without terra-draw's layers: start it again on it.
    map.on('style.load', start)
    return () => {
      map.off('style.load', start)
      stop()
    }
  }, [mapRef, drawingEnabled, draftPaths == null, onDraftChange])

  if (mode == null) return null
  return (
    <div
      role="status"
      className="absolute inset-x-3 bottom-9 z-10 mx-auto flex w-fit items-center gap-2.5 rounded-md bg-surface py-1.5 pr-1.5 pl-3 text-muted-foreground text-sm shadow-md ring-1 ring-border"
    >
      <span className={mode === 'select' ? 'pr-1.5' : undefined}>
        {mode === 'polygon' ? m.settings_map_hint_draw() : m.settings_map_hint_shape()}
      </span>
      {mode === 'polygon' && (
        <Button type="button" variant="ghost" size="sm" onClick={() => drawRef.current?.polygon.undo()}>
          <Undo2 aria-hidden="true" />
          {m.settings_map_hint_undo()}
        </Button>
      )}
    </div>
  )
}

/** Our zoom and « Recentrer sur l'assemblée »: back to the perimeter and the zones, else to the area. */
function Recenter({
  home,
  perimeter,
  overlays,
}: {
  home: Bbox
  perimeter: CardOverlayPath[] | null
  overlays: ShapeProps['overlays']
}) {
  const { current: map } = useMap()
  return (
    <MapControls
      labels={{
        zoomIn: m.my_territories_map_zoom_in(),
        zoomOut: m.my_territories_map_zoom_out(),
        recenter: m.settings_map_recenter(),
      }}
      onZoomIn={() => map?.zoomIn()}
      onZoomOut={() => map?.zoomOut()}
      onRecenter={() =>
        map?.fitBounds(shapesBounds([perimeter ?? [], ...overlays.map(overlay => overlay.paths)]) ?? bboxBounds(home), {
          padding: PADDING,
          maxZoom: MAX_FIT_ZOOM,
        })
      }
    />
  )
}

/** The shape opened for reshaping, on terra-draw and in view if it was not. */
function seedInView(map: MapLibreGlMap, draw: TerraDraw, draft: CardOverlayPath[]) {
  seedPolygon(draw, draft)
  const bounds = shapesBounds([draft])
  const view = map.getBounds()
  if (bounds != null && !(view.contains(bounds[0]) && view.contains(bounds[1]))) {
    map.fitBounds(bounds, { padding: PADDING, maxZoom: MAX_FIT_ZOOM })
  }
}

function polygonOf(paths: CardOverlayPath[], properties: Record<string, string>) {
  return {
    type: 'Feature' as const,
    properties,
    geometry: { type: 'Polygon' as const, coordinates: [[...paths, paths[0]].map(point => [point.lng, point.lat])] },
  }
}

/** Around every point of the shapes; null when there is none. */
function shapesBounds(shapes: CardOverlayPath[][]): LngLatBounds | null {
  const points = shapes.flat()
  if (points.length === 0) return null
  const lngs = points.map(point => point.lng)
  const lats = points.map(point => point.lat)
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ]
}

function bboxBounds(area: Bbox): LngLatBounds {
  return [
    [area.swLng, area.swLat],
    [area.neLng, area.neLat],
  ]
}
