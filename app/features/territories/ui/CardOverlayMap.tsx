import {
  Map as GoogleMap,
  APIProvider as GoogleMapApiProvider,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps'
import { useEffect, useRef } from 'react'
import type { CardOverlay, CardOverlayPath } from '~/features/territories/model/card-overlay'
import { Card, CardContent } from '~/shared/ui/card'
import MapConsentBanner, { useMapConsent } from '~/shared/ui/MapConsentBanner'

type Props = {
  apiKey?: string
  overlays: CardOverlay[]
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
  drawingEnabled,
  draftPaths,
  draftColor,
  onDraftChange,
}: Pick<Props, 'overlays' | 'drawingEnabled' | 'draftPaths' | 'draftColor' | 'onDraftChange'>) {
  const map = useMap()
  const drawingLib = useMapsLibrary('drawing')
  const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(null)
  const draftPolygonRef = useRef<google.maps.Polygon | null>(null)
  const overlayPolygonsRef = useRef<google.maps.Polygon[]>([])

  // Render existing overlays as read-only polygons
  useEffect(() => {
    if (map == null) return
    for (const polygon of overlayPolygonsRef.current) polygon.setMap(null)
    overlayPolygonsRef.current = overlays.map(overlay => {
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
  }, [map, overlays])

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
  drawingEnabled,
  draftPaths,
  draftColor,
  onDraftChange,
  initialCenter,
  initialZoom,
  className,
}: Props) {
  const { consented, grantConsent } = useMapConsent()

  if (apiKey == null || apiKey.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="p-6 text-sm text-muted-foreground">
          La configuration Google Maps n’est pas active. L’éditeur visuel est désactivé, mais l’import/export GeoJSON
          reste disponible.
        </CardContent>
      </Card>
    )
  }

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
