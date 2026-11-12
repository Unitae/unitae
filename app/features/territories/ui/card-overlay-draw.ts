import type { Map as MapLibreMap } from 'maplibre-gl'
import { TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode } from 'terra-draw'
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter'

import type { CardOverlayPath } from '~/features/territories/model/card-overlay'
import { cardOverlayPathToTerraDrawRing, terraDrawRingToCardOverlayPath } from './card-overlay-map-bridge'

// terra-draw on the zones map: one instance drives both drawing a new shape (polygon mode) and reshaping one (select
// mode, its points draggable, a midpoint adds one, a right click removes one). Part of the map's chunk.

// Also enforced by Terra Draw's feature validator: seed coordinates must be rounded to at most this many decimals or
// addFeatures silently rejects them. Nine decimals is about 0.1 mm at the equator.
const COORDINATE_PRECISION = 9

type Hex = `#${string}`

export interface DrawLook {
  /** The shape's colour: its outline, fill and handles. */
  color: string
  /** The handles' inside: the page's surface, light or dark. */
  surface: string
}

/** A started terra-draw instance on the map, and its polygon mode (for « Annuler le dernier point »). */
export function startDraw(map: MapLibreMap, look: DrawLook) {
  const color = look.color as Hex
  const surface = look.surface as Hex
  const polygon = new TerraDrawPolygonMode({
    editable: true,
    showCoordinatePoints: true,
    styles: {
      fillColor: color,
      fillOpacity: 0.16,
      outlineColor: color,
      outlineWidth: 2.5,
      closingPointColor: surface,
      closingPointOutlineColor: color,
      closingPointWidth: 5,
      closingPointOutlineWidth: 2,
      coordinatePointColor: surface,
      coordinatePointOutlineColor: color,
      coordinatePointWidth: 5,
      coordinatePointOutlineWidth: 2,
    },
  })
  const draw = new TerraDraw({
    adapter: new TerraDrawMapLibreGLAdapter({ map, coordinatePrecision: COORDINATE_PRECISION }),
    modes: [
      new TerraDrawSelectMode({
        // terra-draw would deselect on Escape and delete the shape on Delete: the page holds the shape until it is
        // saved or cancelled, so the map must not drop it behind its back.
        keyEvents: { deselect: null, delete: null, rotate: null, scale: null },
        flags: {
          polygon: {
            feature: { draggable: false, coordinates: { midpoints: true, draggable: true, deletable: true } },
          },
        },
        styles: {
          selectedPolygonColor: color,
          selectedPolygonFillOpacity: 0.16,
          selectedPolygonOutlineColor: color,
          selectedPolygonOutlineWidth: 2.5,
          selectionPointColor: surface,
          selectionPointOutlineColor: color,
          selectionPointWidth: 5.5,
          selectionPointOutlineWidth: 2,
          midPointColor: surface,
          midPointOutlineColor: color,
          midPointWidth: 3.5,
          midPointOutlineWidth: 1.5,
        },
      }),
      polygon,
    ],
  })
  draw.start()
  return { draw, polygon }
}

/** Puts an existing shape on the map, selected, so its points can be dragged right away. */
export function seedPolygon(draw: TerraDraw, paths: CardOverlayPath[]) {
  // Select mode only tracks features that exist while it is active: enter it BEFORE adding the shape, or
  // selectFeature throws « No feature with this id ».
  draw.setMode('select')
  const scale = 10 ** COORDINATE_PRECISION
  const rounded = paths.map(point => ({
    lat: Math.round(point.lat * scale) / scale,
    lng: Math.round(point.lng * scale) / scale,
  }))
  const [validation] = draw.addFeatures([
    {
      type: 'Feature',
      properties: { mode: 'polygon' },
      geometry: { type: 'Polygon', coordinates: [cardOverlayPathToTerraDrawRing(rounded)] },
    },
  ])
  if (validation != null && !validation.valid) {
    throw new Error(`Terra Draw rejected the seeded polygon: ${validation.reason ?? 'unknown reason'}`)
  }
  // Selected already, so a second click is not needed. A terra-draw upgrade could change this contract: the shape
  // then stays visible and clickable.
  if (validation?.id != null) {
    try {
      draw.selectFeature(validation.id)
    } catch {
      // Click-to-select still works.
    }
  }
}

/** Reports the shape as it is closed, then as its points move. Returns the unsubscribe. */
export function onShapeChange(draw: TerraDraw, isCurrent: () => boolean, report: (paths: CardOverlayPath[]) => void) {
  const emit = () => {
    const shape = draw.getSnapshot().find(feature => feature.geometry.type === 'Polygon')
    if (shape == null) return
    report(terraDrawRingToCardOverlayPath((shape.geometry.coordinates as [number, number][][])[0]))
  }
  // `change` fires on every click while a new polygon is drawn, and on every point moved while reshaping. Only the
  // latter is reported: a half-drawn polygon is not a shape, and reporting it from inside terra-draw's own click
  // handling would interleave with it (« Mode must be unregistered or stopped to start »).
  const onChange = (_ids: (string | number)[], type: string) => {
    if (type === 'update' && draw.getMode() === 'select') emit()
  }
  // `finish` fires once, when the polygon closes. The switch to select mode waits for terra-draw's click to end.
  const onFinish = () => {
    queueMicrotask(() => {
      if (!isCurrent()) return
      if (draw.getMode() === 'polygon') draw.setMode('select')
      emit()
    })
  }
  draw.on('change', onChange)
  draw.on('finish', onFinish)
  return () => {
    draw.off('change', onChange)
    draw.off('finish', onFinish)
  }
}
