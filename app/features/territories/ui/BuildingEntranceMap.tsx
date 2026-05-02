import {
  AdvancedMarker,
  Map as GoogleMap,
  APIProvider as GoogleMapApiProvider,
} from '@vis.gl/react-google-maps'
import { EntranceMarkerPin } from '~/features/territories/ui/EntranceMarkerPin'
import type { Entrance } from '~/shared/types/entrance'
import { Card, CardContent } from '~/shared/ui/card'
import MapConsentBanner, { useMapConsent } from '~/shared/ui/MapConsentBanner'

export default function BuildingEntranceMap({ entrances, apiKey }: { apiKey?: string; entrances: Entrance[] }) {
  const { consented, grantConsent } = useMapConsent()

  if (apiKey == null) return null

  if (!consented) {
    return (
      <Card className="sticky top-0 max-h-screen w-2xl max-sm:hidden">
        <CardContent className="h-full p-0">
          <MapConsentBanner onAccept={grantConsent} />
        </CardContent>
      </Card>
    )
  }

  const mapCenter = {
    lat: entrances[0]?.buildings[0]?.latitude ?? 45.737623,
    lng: entrances[0]?.buildings[0]?.longitude ?? 4.8371592,
  }

  return (
    <Card className="sticky top-0 max-h-screen w-2xl max-sm:hidden">
      <CardContent className="h-full p-0">
        <GoogleMapApiProvider apiKey={apiKey}>
          <GoogleMap
            mapId="unitae-territory-display"
            defaultCenter={mapCenter}
            defaultZoom={17}
            className="h-full min-h-[500px] w-full rounded-lg"
            disableDefaultUI={true}
          >
            {entrances.flatMap(entrance =>
              entrance.buildings
                .filter(building => building.latitude != null && building.longitude != null)
                .map(building => (
                  <AdvancedMarker
                    key={building.id}
                    position={{
                      // biome-ignore lint/style/noNonNullAssertion: buildings with map markers always have coordinates
                      lat: building.latitude!,
                      // biome-ignore lint/style/noNonNullAssertion: buildings with map markers always have coordinates
                      lng: building.longitude!,
                    }}
                  >
                    <EntranceMarkerPin />
                  </AdvancedMarker>
                )),
            )}
          </GoogleMap>
        </GoogleMapApiProvider>
      </CardContent>
    </Card>
  )
}
