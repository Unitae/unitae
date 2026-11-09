import { AdvancedMarker, Map as GoogleMap, APIProvider as GoogleMapApiProvider } from '@vis.gl/react-google-maps'

import type { HolderEntrance } from '~/features/territories/model/holder-territory'
import * as m from '~/i18n/paraglide/messages'
import MapConsentBanner, { useMapConsent } from '~/shared/ui/MapConsentBanner'

/** Keeps the outermost pins off the map's edges. */
const BOUNDS_MARGIN = 0.0008

interface HolderTerritoryMapProps {
  apiKey: string
  number: string
  entrances: HolderEntrance[]
}

/** The territory's buildings on a map, each pin carrying the number the list shows. */
export function HolderTerritoryMap({ apiKey, number, entrances }: HolderTerritoryMapProps) {
  const { consented, grantConsent } = useMapConsent()
  if (!consented) return <MapConsentBanner onAccept={grantConsent} />

  const pins = entrances.flatMap(entrance =>
    entrance.points.map((point, index) => ({ key: `${entrance.id}-${index}`, ...point })),
  )
  if (pins.length === 0) return null

  const lats = pins.map(pin => pin.lat)
  const lngs = pins.map(pin => pin.lng)
  const bounds = {
    north: Math.max(...lats) + BOUNDS_MARGIN,
    south: Math.min(...lats) - BOUNDS_MARGIN,
    east: Math.max(...lngs) + BOUNDS_MARGIN,
    west: Math.min(...lngs) - BOUNDS_MARGIN,
  }

  return (
    <section
      aria-label={m.my_territories_map_label({ number })}
      className="overflow-hidden rounded-lg border border-border"
    >
      <GoogleMapApiProvider apiKey={apiKey}>
        <GoogleMap
          mapId="unitae-territory-display"
          defaultBounds={bounds}
          className="h-[60vh] max-h-[720px] w-full xl:h-[calc(100vh-10rem)]"
          disableDefaultUI={true}
          zoomControl={true}
        >
          {pins.map(pin => (
            <AdvancedMarker key={pin.key} position={{ lat: pin.lat, lng: pin.lng }}>
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-brand px-1.5 font-semibold text-[11px] text-white tabular-nums shadow-sm ring-2 ring-white">
                {pin.number}
              </span>
            </AdvancedMarker>
          ))}
        </GoogleMap>
      </GoogleMapApiProvider>
    </section>
  )
}
