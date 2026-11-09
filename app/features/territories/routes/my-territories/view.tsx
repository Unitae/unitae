import { SegmentedControl } from '@unitae/ui'
import { Download, MapPin } from 'lucide-react'
import { useState } from 'react'
import { redirect } from 'react-router'

import { groupByStreet, toHolderEntrance } from '~/features/territories/model/holder-territory'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { computeStatus, getUserTerritoryDetail } from '~/features/territories/server/my-territories.server'
import { HolderTerritoryFacts, LoanStatus } from '~/features/territories/ui/HolderLoan'
import { HolderTerritoryBody, type HolderView } from '~/features/territories/ui/HolderTerritoryBody'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { congregationContext, currentAccountContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { getBoolSetting } from '~/shared/domain/settings.server'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { Button } from '~/shared/ui/button'
import { PageHeader } from '~/shared/ui/PageHeader'
import { getOptionalEnv } from '~/shared/utils/env.server'
import { requireParamId } from '~/shared/utils/params.server'
import { cn } from '~/shared/utils/utils'

import type { Route } from './+types/view'

export const meta: Route.MetaFunction = ({ loaderData }) => {
  if (!loaderData) return [{ title: 'Unitae' }]
  return [{ title: m.my_territories_view_meta_title({ number: loaderData.territory.number }) }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const currentUser = context.get(currentAccountContext)
  const { timezone } = context.get(congregationContext)
  const territoryId = requireParamId(params.territoryId, '/me/territories')
  const memberId = currentUser.member?.id ?? null

  return withScopeFromContext(context, async db => {
    const attribution = memberId == null ? null : await getUserTerritoryDetail(db, memberId, territoryId)
    if (attribution == null) throw redirect('/me/territories')

    const locale = getLocale()
    const entrances = attribution.territory.entrances.flatMap(entrance => toHolderEntrance(entrance, locale) ?? [])
    const apiKey = getOptionalEnv('GOOGLE_MAPS_API_KEY')
    const [phoneTypeActive, mapTabActive] = await Promise.all([
      getBoolSetting(db, TerritorySettingKey.TerritoryTypePhoneActive, currentUser.congregationId),
      getBoolSetting(db, TerritorySettingKey.MapTabActive, currentUser.congregationId),
    ])

    return {
      territory: {
        id: attribution.territory.id,
        number: attribution.territory.number,
        type: attribution.territory.type,
      },
      streets: groupByStreet(entrances, locale),
      totals: {
        entrances: entrances.length,
        // An entrance without a household count still has its phone numbers to call.
        homes: entrances.reduce((sum, entrance) => sum + (entrance.homes || entrance.phones), 0),
        phones: entrances.reduce((sum, entrance) => sum + entrance.phones, 0),
      },
      attribution: {
        startDate: attribution.startDate,
        lateDate: attribution.lateDate,
        pausedAt: attribution.pausedAt,
        byPhone: attribution.type === TerritoryAttributionKind.Phone,
        campaignName: attribution.campaign?.name ?? null,
        status: computeStatus(attribution.lateDate),
      },
      showPhone: phoneTypeActive ?? false,
      // The map needs the congregation's choice, a key and one building placed on it: without them
      // there is nothing to show, and the list keeps the whole width.
      mapKey: mapTabActive && apiKey && entrances.some(entrance => entrance.points.length > 0) ? apiKey : null,
      timeZone: timezone,
    }
  })
}

export default function MyTerritoryView({ loaderData }: Route.ComponentProps) {
  const { territory, streets, totals, attribution, showPhone, mapKey, timeZone } = loaderData
  const [view, setView] = useState<HolderView>('list')

  return (
    <div className={cn('flex flex-col', mapKey != null ? 'max-w-6xl' : 'max-w-4xl')}>
      <PageHeader
        icon={MapPin}
        title={m.territory_doc_title({ name: territory.number })}
        titleBadge={<LoanStatus loan={attribution} timeZone={timeZone} form="long" relative="inline" />}
        meta={
          // The map alone on a phone leaves the header to the title and the due date.
          <div className={cn('contents', view === 'map' && 'max-xl:hidden')}>
            <HolderTerritoryFacts
              type={territory.type}
              totals={totals}
              loan={attribution}
              campaignName={attribution.campaignName}
              byPhone={attribution.byPhone}
              timeZone={timeZone}
            />
          </div>
        }
        breadcrumbs={[{ label: m.sidebar_my_territories(), to: '/me/territories' }, { label: territory.number }]}
        actions={
          <Button asChild variant="outline" size="sm">
            <a href={`/territories/territory/${territory.id}/pdf`}>
              <Download aria-hidden="true" />
              {m.my_territories_download_pdf()}
            </a>
          </Button>
        }
        controls={
          mapKey != null ? (
            // Side by side from xl; below, one at a time.
            <div className="xl:hidden">
              <SegmentedControl
                options={[
                  { value: 'list' as const, label: m.my_territories_view_list() },
                  { value: 'map' as const, label: m.my_territories_tab_map() },
                ]}
                value={view}
                onValueChange={setView}
                aria-label={m.my_territories_view_label()}
              />
            </div>
          ) : undefined
        }
      />

      <HolderTerritoryBody
        streets={streets}
        territoryType={territory.type}
        showPhone={showPhone}
        map={mapKey == null ? null : { apiKey: mapKey, number: territory.number }}
        view={view}
        onViewChange={setView}
      />
    </div>
  )
}
