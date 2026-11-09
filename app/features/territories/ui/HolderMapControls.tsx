import { useMap } from '@vis.gl/react-google-maps'
import { Focus, Minus, Plus } from 'lucide-react'
import { useEffect } from 'react'

import * as m from '~/i18n/paraglide/messages'

const GROUP = 'flex flex-col divide-y divide-border overflow-hidden rounded-md bg-surface shadow-md ring-1 ring-border'
const CONTROL =
  'grid size-11 cursor-pointer place-content-center text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2 xl:size-8'

/** Our zoom buttons and « Recentrer », in place of the map's own controls. */
export function HolderMapControls({ bounds }: { bounds: google.maps.LatLngBoundsLiteral }) {
  const map = useMap()
  const zoomBy = (step: number) => {
    const zoom = map?.getZoom()
    if (map != null && zoom != null) map.setZoom(zoom + step)
  }

  return (
    <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
      <div className={GROUP}>
        <button
          type="button"
          className={CONTROL}
          aria-label={m.my_territories_map_zoom_in()}
          title={m.my_territories_map_zoom_in()}
          onClick={() => zoomBy(1)}
        >
          <Plus aria-hidden="true" className="size-4" />
        </button>
        <button
          type="button"
          className={CONTROL}
          aria-label={m.my_territories_map_zoom_out()}
          title={m.my_territories_map_zoom_out()}
          onClick={() => zoomBy(-1)}
        >
          <Minus aria-hidden="true" className="size-4" />
        </button>
      </div>
      <div className={GROUP}>
        <button
          type="button"
          className={CONTROL}
          aria-label={m.my_territories_map_recenter()}
          title={m.my_territories_map_recenter()}
          onClick={() => map?.fitBounds(bounds)}
        >
          <Focus aria-hidden="true" className="size-4" />
        </button>
      </div>
    </div>
  )
}

/** Brings the entrance picked in the list into view when the map has been moved away from it. */
export function FollowSelection({ position }: { position: google.maps.LatLngLiteral | null }) {
  const map = useMap()
  const lat = position?.lat
  const lng = position?.lng
  useEffect(() => {
    if (map == null || lat == null || lng == null) return
    const point = { lat, lng }
    if (map.getBounds()?.contains(point) === false) map.panTo(point)
  }, [map, lat, lng])
  return null
}
