import {
  Map as GoogleMap,
  APIProvider as GoogleMapApiProvider,
  Marker as GoogleMapMarker,
} from '@vis.gl/react-google-maps'
import type { Entrance } from '~/shared/types/entrance'

export default function BuildingEntranceMap({ entrances, apiKey }: { apiKey?: string; entrances: Entrance[] }) {
  if (apiKey == null) return null

  const mapCenter = {
    lat: entrances[0]?.buildings[0]?.latitude ?? 45.737623,
    lng: entrances[0]?.buildings[0]?.longitude ?? 4.8371592,
  }

  return (
    <GoogleMapApiProvider apiKey={apiKey}>
      <GoogleMap
        defaultCenter={mapCenter}
        defaultZoom={17}
        className="sticky top-0 max-h-screen w-2xl pt-3 max-sm:hidden"
        disableDefaultUI={true}
      >
        {entrances.flatMap(entrance =>
          entrance.buildings
            .filter(building => building.latitude != null && building.longitude != null)
            .map(building => (
              <GoogleMapMarker
                key={building.id}
                position={{
                  lat: building.latitude!,
                  lng: building.longitude!,
                }}
              />
            )),
        )}
      </GoogleMap>
    </GoogleMapApiProvider>
  )
}
