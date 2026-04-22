import {
  Map as GoogleMap,
  APIProvider as GoogleMapApiProvider,
  Marker as GoogleMapMarker,
} from '@vis.gl/react-google-maps'
import { Download, MapPin } from 'lucide-react'
import { useEffect, useState } from 'react'
import { redirect } from 'react-router'
import type { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { aggregateEntrance } from '~/features/territories/server/buildings.server'
import {
  computeStatus,
  getUserTerritoryDetail,
  type TerritoryStatus,
} from '~/features/territories/server/my-territories.server'
import { TerritoryDownloadLink } from '~/features/territories/ui/TerritoryDownloadLink'
import { TerritoryEntranceCard } from '~/features/territories/ui/TerritoryEntranceCard'
import * as m from '~/paraglide/messages'
import { userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { getBoolSetting } from '~/shared/domain/settings.server'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { Badge } from '~/shared/ui/badge'
import { Button } from '~/shared/ui/button'
import MapConsentBanner, { useMapConsent } from '~/shared/ui/MapConsentBanner'
import { PageHeader } from '~/shared/ui/PageHeader'
import { RelativeTime } from '~/shared/ui/RelativeTime'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/shared/ui/tabs'
import { getOptionalEnv } from '~/shared/utils/env.server'
import { requireParamId } from '~/shared/utils/params.server'
import { formatAbsoluteDate } from '~/shared/utils/relative-time'

import type { Route } from './+types/view'

export const meta: Route.MetaFunction = ({ data }) => {
  if (!data) return [{ title: 'Unitae' }]
  return [{ title: m.my_territories_view_meta_title({ number: data.territory.number }) }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const currentUser = context.get(userContext)
  const territoryId = requireParamId(params.territoryId, '/me/territories')

  return withScopeFromContext(context, async db => {
    const attribution = await getUserTerritoryDetail(db, currentUser.id, territoryId)

    if (attribution == null) {
      throw redirect('/me/territories')
    }

    const apiKey = getOptionalEnv('GOOGLE_MAPS_API_KEY')
    const mapId = getOptionalEnv('GOOGLE_MAPS_MAP_ID')
    const phoneTypeActive = await getBoolSetting(
      db,
      TerritorySettingKey.TerritoryTypePhoneActive,
      currentUser.congregationId,
    )

    return {
      territory: attribution.territory,
      entrances: attribution.territory.entrances.filter(e => e.buildings.length > 0).map(aggregateEntrance),
      attribution: {
        startDate: attribution.startDate,
        lateDate: attribution.lateDate,
        type: attribution.type,
        status: computeStatus(attribution.lateDate),
      },
      phoneTypeActive,
      googleMaps: { apiKey, mapId },
    }
  })
}

const statusVariant: Record<TerritoryStatus, 'success' | 'warning' | 'destructive'> = {
  'on-time': 'success',
  'due-soon': 'warning',
  overdue: 'destructive',
}

function statusLabel(status: TerritoryStatus): string {
  if (status === 'on-time') return m.dashboard_territory_on_time()
  if (status === 'due-soon') return m.dashboard_territory_due_soon()
  return m.dashboard_territory_overdue()
}

export default function MyTerritoryView({ loaderData }: Route.ComponentProps) {
  const { territory, entrances, attribution, phoneTypeActive, googleMaps } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.territory_doc_title({ name: territory.number })}
        breadcrumbs={[{ label: m.sidebar_my_territories(), to: '/me/territories' }, { label: territory.number }]}
        backTo="/me/territories"
        actions={
          <PdfDownloadButton
            territory={territory}
            entrances={entrances}
            googleMaps={googleMaps}
            phoneTypeActive={phoneTypeActive}
            attributionType={attribution.type}
          />
        }
      />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={statusVariant[attribution.status]}>{statusLabel(attribution.status)}</Badge>
        <span className="text-muted-foreground">
          {m.my_territories_attributed_on({ date: formatAbsoluteDate(attribution.startDate) })}
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">
          {m.my_territories_return_by({ date: formatAbsoluteDate(attribution.lateDate) })} (
          <RelativeTime date={attribution.lateDate} />)
        </span>
      </div>

      <Tabs defaultValue="territory">
        <TabsList>
          <TabsTrigger value="territory">{m.my_territories_tab_territory()}</TabsTrigger>
          <TabsTrigger value="map">{m.my_territories_tab_map()}</TabsTrigger>
        </TabsList>

        <TabsContent value="territory">
          <div className="flex flex-col gap-3">
            {entrances.map(entrance => (
              <TerritoryEntranceCard
                key={entrance.id}
                entrance={entrance}
                territoryType={territory.type}
                showPhone={phoneTypeActive}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="map">
          <TerritoryMap entrances={entrances} apiKey={googleMaps.apiKey} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function PdfDownloadButton({
  territory,
  entrances,
  googleMaps,
  phoneTypeActive,
  attributionType,
}: {
  territory: { number: string; type: string }
  entrances: ReturnType<typeof aggregateEntrance>[]
  googleMaps: { apiKey: string | undefined; mapId: string | undefined }
  phoneTypeActive: boolean | undefined
  attributionType: string
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted) return null

  return (
    <TerritoryDownloadLink
      territory={territory}
      entrances={entrances}
      googleMapKey={googleMaps.apiKey}
      googleMapId={googleMaps.mapId}
      showPhone={phoneTypeActive}
      attributionType={attributionType as TerritoryAttributionKind}
    >
      <Button variant="outline" size="sm" className="gap-1.5">
        <Download className="size-3.5" />
        {m.my_territories_download_pdf()}
      </Button>
    </TerritoryDownloadLink>
  )
}

function TerritoryMap({ entrances, apiKey }: { entrances: ReturnType<typeof aggregateEntrance>[]; apiKey?: string }) {
  const { consented, grantConsent } = useMapConsent()

  if (apiKey == null) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed py-16">
        <div className="flex flex-col items-center gap-2 text-center">
          <MapPin className="size-8 text-muted-foreground/50" />
          <p className="text-muted-foreground text-sm">{m.my_territories_map_unavailable()}</p>
        </div>
      </div>
    )
  }

  if (!consented) {
    return <MapConsentBanner onAccept={grantConsent} />
  }

  const mapCenter = {
    lat: entrances[0]?.buildings[0]?.latitude ?? 45.737623,
    lng: entrances[0]?.buildings[0]?.longitude ?? 4.8371592,
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <GoogleMapApiProvider apiKey={apiKey}>
        <GoogleMap
          defaultCenter={mapCenter}
          defaultZoom={17}
          className="h-[500px] w-full sm:h-[600px]"
          disableDefaultUI={true}
        >
          {entrances.flatMap(entrance =>
            entrance.buildings
              .filter(b => b.latitude != null && b.longitude != null)
              .map(building => (
                <GoogleMapMarker key={building.id} position={{ lat: building.latitude!, lng: building.longitude! }} />
              )),
          )}
        </GoogleMap>
      </GoogleMapApiProvider>
    </div>
  )
}
