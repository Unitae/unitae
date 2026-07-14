import { Map as GoogleMap, APIProvider as GoogleMapApiProvider, useMap } from '@vis.gl/react-google-maps'
import { useEffect, useRef } from 'react'
import { TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode } from 'terra-draw'
import { TerraDrawGoogleMapsAdapter } from 'terra-draw-google-maps-adapter'
import type { CardOverlay, CardOverlayPath } from '~/features/territories/model/card-overlay'
import MapConsentBanner, { useMapConsent } from '~/shared/ui/MapConsentBanner'
import { cardOverlayPathToTerraDrawRing, terraDrawRingToCardOverlayPath } from './card-overlay-map-bridge'

type Props = {
  apiKey?: string
  overlays: CardOverlay[]
  excludeOverlayId?: number | null
  perimeter?: CardOverlayPath[] | null
  excludePerimeter?: boolean
  drawingEnabled: boolean
  draftPaths: CardOverlayPath[] | null
  draftColor: string
  onDraftChange: (paths: CardOverlayPath[]) => void
  initialCenter?: { lat: number; lng: number }
  initialZoom?: number
  className?: string
}

const PERIMETER_COLOR = '#6B7280'

const DEFAULT_CENTER = { lat: 46.6, lng: 1.9 }
const DEFAULT_ZOOM = 6

// Passed to TerraDrawGoogleMapsAdapter — also enforced by Terra Draw's feature validator,
// so seed coordinates must be rounded to at most this many decimal places or addFeatures
// will silently reject them. Nine decimals gives ~0.1 mm resolution at the equator.
const COORDINATE_PRECISION = 9

function pathFromCardOverlay(paths: CardOverlayPath[]): google.maps.LatLngLiteral[] {
  return paths.map(p => ({ lat: p.lat, lng: p.lng }))
}

function seedInitialPolygon(draw: TerraDraw, initialDraft: CardOverlayPath[]) {
  // Enter select mode BEFORE adding the feature: select mode only tracks features that
  // exist while it is active. If we added first and switched second, selectFeature would
  // throw "No feature with this id" because select's local store wouldn't be populated.
  draw.setMode('select')
  // Round to the adapter's coordinatePrecision. Google Maps returns raw IEEE 754 doubles
  // (often 15+ decimal places in string form) — Terra Draw's addFeatures validator
  // rejects any coordinate with more decimals than coordinatePrecision, so the feature
  // would be silently discarded and the user would see an empty map instead of the polygon.
  const scale = 10 ** COORDINATE_PRECISION
  const rounded = initialDraft.map(p => ({
    lat: Math.round(p.lat * scale) / scale,
    lng: Math.round(p.lng * scale) / scale,
  }))
  const ring = cardOverlayPathToTerraDrawRing(rounded)
  const [validation] = draw.addFeatures([
    {
      type: 'Feature',
      properties: { mode: 'polygon' },
      geometry: { type: 'Polygon', coordinates: [ring] },
    },
  ])
  if (validation != null && !validation.valid) {
    throw new Error(`Terra Draw rejected the seeded polygon: ${validation.reason ?? 'unknown reason'}`)
  }
  // Pre-select so the user doesn't have to click the polygon a second time after clicking
  // the "edit shape" button. Wrapped in try/catch because a Terra Draw upgrade could change
  // this contract — worst case we fall back to click-to-select.
  if (validation?.id != null) {
    try {
      draw.selectFeature(validation.id)
    } catch {
      // Fall back silently: the polygon is still visible and clickable.
    }
  }
}

function attachDrawEvents(
  draw: TerraDraw,
  drawRef: React.RefObject<TerraDraw | null>,
  onDraftChange: (paths: CardOverlayPath[]) => void,
): () => void {
  const emitCurrentPolygon = () => {
    const poly = draw.getSnapshot().find(f => f.geometry.type === 'Polygon')
    if (poly == null) return
    const ring = (poly.geometry.coordinates as [number, number][][])[0]
    onDraftChange(terraDrawRingToCardOverlayPath(ring))
  }

  // `change` fires on every intermediate click during a new polygon (create, update, update…)
  // as well as on select-mode vertex edits. We only want the latter — the initial drawing
  // updates are noise (partial polygons don't validate) and forwarding them synchronously
  // would let downstream state churn interleave with Terra Draw's own click handling and
  // trigger "Mode must be unregistered or stopped to start" errors.
  const onChange = (_ids: (string | number)[], type: string) => {
    if (type !== 'update') return
    if (draw.getMode() !== 'select') return
    emitCurrentPolygon()
  }

  // `finish` fires exactly once, when the user closes the polygon (double-click by default).
  const onFinish = () => {
    // Defer the mode switch out of Terra Draw's own click callstack — switching mid-click
    // otherwise resets the polygon mode's internal state machine (crash: "Mode must be
    // unregistered or stopped to start").
    queueMicrotask(() => {
      if (drawRef.current !== draw) return
      if (draw.getMode() === 'polygon') draw.setMode('select')
      emitCurrentPolygon()
    })
  }

  draw.on('change', onChange)
  draw.on('finish', onFinish)
  return () => {
    draw.off('change', onChange)
    draw.off('finish', onFinish)
  }
}

function MapContents({
  overlays,
  excludeOverlayId,
  perimeter,
  excludePerimeter,
  drawingEnabled,
  draftPaths,
  draftColor,
  onDraftChange,
}: Pick<
  Props,
  | 'overlays'
  | 'excludeOverlayId'
  | 'perimeter'
  | 'excludePerimeter'
  | 'drawingEnabled'
  | 'draftPaths'
  | 'draftColor'
  | 'onDraftChange'
>) {
  const map = useMap()
  const overlayPolygonsRef = useRef<google.maps.Polygon[]>([])
  const perimeterPolygonRef = useRef<google.maps.Polygon | null>(null)
  const drawRef = useRef<TerraDraw | null>(null)
  // Ref-mirror inputs the Terra Draw effect needs to read WITHOUT re-running:
  // - draftPaths: mid-edit vertex drags update it constantly; a re-run would tear the instance down.
  // - draftColor: user can change color mid-draw via the color picker; a re-run would drop
  //   every vertex laid so far. Color-updates to the on-screen polygon are deferred until the
  //   next legitimate re-init (e.g. submit + reload) — acceptable for a rare flow.
  const draftPathsRef = useRef(draftPaths)
  draftPathsRef.current = draftPaths
  const draftColorRef = useRef(draftColor)
  draftColorRef.current = draftColor

  useEffect(() => {
    if (map == null) return
    perimeterPolygonRef.current?.setMap(null)
    if (perimeter == null || excludePerimeter || perimeter.length < 3) {
      perimeterPolygonRef.current = null
      return
    }
    perimeterPolygonRef.current = new google.maps.Polygon({
      paths: pathFromCardOverlay(perimeter),
      strokeColor: PERIMETER_COLOR,
      strokeOpacity: 0.8,
      strokeWeight: 2,
      fillColor: PERIMETER_COLOR,
      fillOpacity: 0.05,
      clickable: false,
      map,
    })
    return () => {
      perimeterPolygonRef.current?.setMap(null)
      perimeterPolygonRef.current = null
    }
  }, [map, perimeter, excludePerimeter])

  useEffect(() => {
    if (map == null) return
    for (const polygon of overlayPolygonsRef.current) polygon.setMap(null)
    overlayPolygonsRef.current = overlays
      .filter(overlay => overlay.id !== excludeOverlayId)
      .map(overlay => {
        return new google.maps.Polygon({
          paths: pathFromCardOverlay(overlay.paths),
          strokeColor: overlay.color,
          strokeWeight: 1,
          fillColor: overlay.color,
          fillOpacity: 0.5,
          clickable: false,
          map,
        })
      })
    return () => {
      for (const polygon of overlayPolygonsRef.current) polygon.setMap(null)
      overlayPolygonsRef.current = []
    }
  }, [map, overlays, excludeOverlayId])

  // One Terra Draw instance drives both the "draw new" and "edit existing" flows.
  // biome-ignore lint/correctness/useExhaustiveDependencies: draftPaths == null is a re-init signal (null↔non-null), not consumed inside the effect (we read draftPathsRef.current instead to survive mid-edit vertex drags)
  useEffect(() => {
    if (map == null) return
    let cancelled = false
    let projListener: google.maps.MapsEventListener | null = null
    let unsubChange: (() => void) | null = null

    const init = () => {
      if (cancelled || drawRef.current != null) return
      // Successful init: drop the deferred projection listener so subsequent projection changes
      // (style toggle, resize) don't re-fire init(). Cleanup already covers the cancelled path.
      projListener?.remove()
      projListener = null
      const color = draftColorRef.current as `#${string}`
      const draw = new TerraDraw({
        adapter: new TerraDrawGoogleMapsAdapter({ map, lib: google.maps, coordinatePrecision: COORDINATE_PRECISION }),
        modes: [
          new TerraDrawSelectMode({
            flags: {
              polygon: {
                feature: {
                  draggable: false,
                  coordinates: { midpoints: true, draggable: true, deletable: true },
                },
              },
            },
          }),
          new TerraDrawPolygonMode({
            editable: true,
            styles: { fillColor: color, outlineColor: color, fillOpacity: 0.4 },
          }),
        ],
      })
      draw.start()
      drawRef.current = draw

      const initialDraft = draftPathsRef.current
      if (initialDraft != null && initialDraft.length >= 3) {
        seedInitialPolygon(draw, initialDraft)
      } else if (drawingEnabled) {
        draw.setMode('polygon')
      }

      unsubChange = attachDrawEvents(draw, drawRef, onDraftChange)
    }

    // Terra Draw needs a live map projection; wait for it if tiles haven't finished loading.
    if (map.getProjection() != null) init()
    else
      projListener = map.addListener('projection_changed', () => {
        if (map.getProjection() != null) init()
      })

    return () => {
      cancelled = true
      projListener?.remove()
      unsubChange?.()
      drawRef.current?.stop()
      drawRef.current = null
    }
  }, [map, drawingEnabled, draftPaths == null, onDraftChange])

  return null
}

export default function CardOverlayMap({
  apiKey,
  overlays,
  excludeOverlayId,
  perimeter,
  excludePerimeter,
  drawingEnabled,
  draftPaths,
  draftColor,
  onDraftChange,
  initialCenter,
  initialZoom,
  className,
}: Props) {
  const { consented, grantConsent } = useMapConsent()

  // The page is responsible for hiding this component entirely when no API key is configured —
  // we still guard here to avoid crashing if it ever gets rendered without one.
  if (apiKey == null || apiKey.length === 0) return null

  if (!consented) {
    return <MapConsentBanner onAccept={grantConsent} />
  }

  return (
    <div className={className}>
      <GoogleMapApiProvider apiKey={apiKey}>
        <GoogleMap
          mapId="card-overlay-editor"
          defaultCenter={initialCenter ?? DEFAULT_CENTER}
          defaultZoom={initialZoom ?? DEFAULT_ZOOM}
          gestureHandling="greedy"
          disableDefaultUI={false}
          style={{ width: '100%', height: '100%' }}
        >
          <MapContents
            overlays={overlays}
            excludeOverlayId={excludeOverlayId}
            perimeter={perimeter}
            excludePerimeter={excludePerimeter}
            drawingEnabled={drawingEnabled}
            draftPaths={draftPaths}
            draftColor={draftColor}
            onDraftChange={onDraftChange}
          />
        </GoogleMap>
      </GoogleMapApiProvider>
    </div>
  )
}
