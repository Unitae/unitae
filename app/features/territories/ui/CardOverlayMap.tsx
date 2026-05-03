import {
  Map as GoogleMap,
  APIProvider as GoogleMapApiProvider,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps'
import { useEffect, useRef } from 'react'
import type { CardOverlay, CardOverlayPath } from '~/features/territories/model/card-overlay'
import MapConsentBanner, { useMapConsent } from '~/shared/ui/MapConsentBanner'

type Props = {
  apiKey?: string
  overlays: CardOverlay[]
  excludeOverlayId?: number | null
  drawingEnabled: boolean
  draftPaths: CardOverlayPath[] | null
  draftColor: string
  onDraftChange: (paths: CardOverlayPath[]) => void
  initialCenter?: { lat: number; lng: number }
  initialZoom?: number
  className?: string
}

const DEFAULT_CENTER = { lat: 46.6, lng: 1.9 }
const DEFAULT_ZOOM = 6

function pathFromCardOverlay(paths: CardOverlayPath[]): google.maps.LatLngLiteral[] {
  return paths.map(p => ({ lat: p.lat, lng: p.lng }))
}

function MapContents({
  overlays,
  excludeOverlayId,
  drawingEnabled,
  draftPaths,
  draftColor,
  onDraftChange,
}: Pick<Props, 'overlays' | 'excludeOverlayId' | 'drawingEnabled' | 'draftPaths' | 'draftColor' | 'onDraftChange'>) {
  const map = useMap()
  const drawingLib = useMapsLibrary('drawing')
  const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(null)
  const draftPolygonRef = useRef<google.maps.Polygon | null>(null)
  const overlayPolygonsRef = useRef<google.maps.Polygon[]>([])

  // Render existing overlays as read-only polygons (skip the one currently being edited so it
  // doesn't draw on top of the editable draft polygon).
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

  // Render the in-progress draft polygon (controlled by parent state)
  useEffect(() => {
    if (map == null) return
    draftPolygonRef.current?.setMap(null)
    if (draftPaths == null || draftPaths.length < 3) {
      draftPolygonRef.current = null
      return
    }
    const polygon = new google.maps.Polygon({
      paths: pathFromCardOverlay(draftPaths),
      strokeColor: draftColor,
      strokeWeight: 2,
      fillColor: draftColor,
      fillOpacity: 0.4,
      editable: true,
      draggable: false,
      map,
    })
    const sync = () => {
      const path = polygon
        .getPath()
        .getArray()
        .map(latLng => ({ lat: latLng.lat(), lng: latLng.lng() }))
      onDraftChange(path)
    }
    const listeners = [
      polygon.getPath().addListener('set_at', sync),
      polygon.getPath().addListener('insert_at', sync),
      polygon.getPath().addListener('remove_at', sync),
    ]
    draftPolygonRef.current = polygon
    return () => {
      for (const listener of listeners) listener.remove()
      polygon.setMap(null)
    }
  }, [map, draftPaths, draftColor, onDraftChange])

  // Drawing manager (only attached while drawingEnabled is true)
  useEffect(() => {
    if (map == null || drawingLib == null) return
    if (!drawingEnabled) {
      drawingManagerRef.current?.setMap(null)
      drawingManagerRef.current = null
      return
    }
    const manager = new drawingLib.DrawingManager({
      drawingMode: drawingLib.OverlayType.POLYGON,
      drawingControl: false,
      polygonOptions: {
        strokeColor: draftColor,
        strokeWeight: 2,
        fillColor: draftColor,
        fillOpacity: 0.4,
        clickable: false,
      },
    })
    manager.setMap(map)
    drawingManagerRef.current = manager
    const listener = google.maps.event.addListener(manager, 'polygoncomplete', (polygon: google.maps.Polygon) => {
      const path = polygon
        .getPath()
        .getArray()
        .map(latLng => ({ lat: latLng.lat(), lng: latLng.lng() }))
      polygon.setMap(null)
      manager.setDrawingMode(null)
      onDraftChange(path)
    })
    return () => {
      listener.remove()
      manager.setMap(null)
      drawingManagerRef.current = null
    }
  }, [map, drawingLib, drawingEnabled, draftColor, onDraftChange])

  return null
}

export default function CardOverlayMap({
  apiKey,
  overlays,
  excludeOverlayId,
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
      <GoogleMapApiProvider apiKey={apiKey} libraries={['drawing']}>
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
