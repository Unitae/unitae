import { SegmentedControl } from '@unitae/ui'
import { Building2, ChevronLeft, ChevronRight, Download, MapIcon, Pencil } from 'lucide-react'
import { useState } from 'react'
import { Link, redirect } from 'react-router'
import { groupByStreet, toHolderEntrance } from '~/features/territories/model/holder-territory'
import { getTerritoryPmrStatus } from '~/features/territories/model/pmr-status'
import { territoryStanding } from '~/features/territories/model/territory-standing'
import { getActiveCampaign } from '~/features/territories/server/campaign.queries'
import { findAdjacentTerritories, getTerritoryPage } from '~/features/territories/server/territory-page.queries'
import { ReturnAttributionDialog } from '~/features/territories/ui/AttributionDialogs'
import { AttributionPanel, type AttributionTarget } from '~/features/territories/ui/AttributionPanel'
import { holderName } from '~/features/territories/ui/attribution-labels'
import { HolderTerritoryBody, type HolderView } from '~/features/territories/ui/HolderTerritoryBody'
import { DeleteTerritoryDialog, TerritoryMenu, type TerritoryTarget } from '~/features/territories/ui/TerritoryActions'
import { TerritoryAttribution, TerritoryHistory } from '~/features/territories/ui/TerritoryAttribution'
import { NeighbourLink, TerritoryFacts, TerritoryStandingStatus } from '~/features/territories/ui/TerritoryPageParts'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { permissionsContext, requirePermission, withScopeFromContext } from '~/shared/auth/route-context.server'
import { getBoolSetting } from '~/shared/domain/settings.server'
import { Permission } from '~/shared/types/permission'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { Button } from '~/shared/ui/button'
import { PageHeader } from '~/shared/ui/PageHeader'
import { formatLocalDate } from '~/shared/utils/date.server'
import { getOptionalEnv } from '~/shared/utils/env.server'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/view'

export const meta: Route.MetaFunction = ({ loaderData }) => [
  { title: loaderData ? m.territories_view_meta_title({ number: loaderData.territory.number }) : 'Unitae' },
]

export function loader({ request, params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanViewTerritories)
  const canViewAttributions = permissions.has(Permission.CanViewTerritoryAttributions)
  const territoryId = requireParamId(params.territoryId, '/territories')

  return withScopeFromContext(context, async (db, congregationId) => {
    const page = await getTerritoryPage(db, congregationId, territoryId)
    if (page == null) throw redirect('/territories')

    const locale = getLocale()
    const today = formatLocalDate(new Date())
    const entrances = page.entrances.flatMap(entrance => toHolderEntrance(entrance, locale) ?? [])
    const apiKey = getOptionalEnv('GOOGLE_MAPS_API_KEY')
    const [phoneTypeActive, pmrActive, campaign, adjacent] = await Promise.all([
      getBoolSetting(db, TerritorySettingKey.TerritoryTypePhoneActive, congregationId),
      getBoolSetting(db, TerritorySettingKey.PmrActive, congregationId),
      getActiveCampaign(db, congregationId),
      findAdjacentTerritories(db, congregationId, page.territory, locale),
    ])
    // Who held it and when is the attributions' business: without their right, none of it leaves the server.
    const history = canViewAttributions ? page.history : []
    const standing = territoryStanding(history, { today, campaignMode: campaign != null })
    const pmr = pmrActive
      ? getTerritoryPmrStatus(
          page.territory.type,
          page.entrances.map(entrance => ({ kind: entrance.kind, isPMR: entrance.isPMR })),
        )
      : null

    return {
      territory: page.territory,
      streets: groupByStreet(entrances, locale),
      totals: {
        entrances: entrances.length,
        streets: new Set(entrances.map(entrance => `${entrance.street}|${entrance.zip}`)).size,
        homes: entrances.reduce((sum, entrance) => sum + (entrance.homes || entrance.phones), 0),
        phones: entrances.reduce((sum, entrance) => sum + entrance.phones, 0),
      },
      pmr,
      mapKey: apiKey && entrances.some(entrance => entrance.points.length > 0) ? apiKey : null,
      showPhone: phoneTypeActive ?? false,
      adjacent,
      from: new URL(request.url).searchParams.get('from') ?? '',
      today,
      history,
      ...standing,
      // Only « Supprimer » reads it, and only those who manage territories see that.
      hasHistory: permissions.has(Permission.CanManageTerritories) && page.history.length > 0,
      buildingOf: permissions.has(Permission.CanViewProspection) ? page.buildingOf : {},
      canViewAttributions,
      canManageAttributions: permissions.has(Permission.CanManageTerritoryAttributions),
      canManage: permissions.has(Permission.CanManageTerritories),
      canViewPublishers: permissions.has(Permission.CanViewPublishers),
    }
  })
}

export default function TerritoryView({ loaderData }: Route.ComponentProps) {
  const { territory, current, today, adjacent, from, canViewAttributions } = loaderData
  const [view, setView] = useState<HolderView>('list')
  const [panel, setPanel] = useState<AttributionTarget | null>(null)
  const [returning, setReturning] = useState(false)
  const [deleting, setDeleting] = useState<TerritoryTarget | null>(null)
  const back = from !== '' ? `/territories?${from}` : '/territories'
  const query = from !== '' ? `?from=${encodeURIComponent(from)}` : ''
  const target: TerritoryTarget = {
    id: territory.id,
    number: territory.number,
    hasHistory: loaderData.hasHistory,
    entrances: loaderData.totals.entrances,
  }

  return (
    <div className="flex max-w-6xl flex-col">
      <PageHeader
        icon={MapIcon}
        title={m.territories_view_title({ number: territory.number })}
        titleBadge={
          canViewAttributions ? (
            <TerritoryStandingStatus current={current} availability={loaderData.availability} today={today} />
          ) : undefined
        }
        meta={
          <TerritoryFacts
            type={territory.type}
            totals={loaderData.totals}
            pmr={loaderData.pmr}
            attributed={loaderData.history.length}
          />
        }
        breadcrumbs={[{ label: m.sidebar_territories(), to: back }, { label: territory.number }]}
        actions={
          <>
            <NeighbourLink to={adjacent.prev} query={query} label={m.territory_page_previous} icon={<ChevronLeft />} />
            <NeighbourLink to={adjacent.next} query={query} label={m.territory_page_next} icon={<ChevronRight />} />
            <Button asChild variant="ghost" size="icon" title={m.territories_menu_pdf()}>
              <a href={`/territories/territory/${territory.id}/pdf`} aria-label={m.territories_menu_pdf()}>
                <Download aria-hidden="true" />
              </a>
            </Button>
            {loaderData.canManage && (
              <Button asChild variant="outline" size="sm">
                <Link to={`/territories/territory/${territory.id}/edit`}>
                  <Pencil aria-hidden="true" />
                  {m.territories_menu_edit()}
                </Link>
              </Button>
            )}
            <TerritoryMenu territory={target} canManage={loaderData.canManage} compact onDelete={setDeleting} />
          </>
        }
        controls={
          loaderData.mapKey != null ? (
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
        streets={loaderData.streets}
        territoryType={territory.type}
        showPhone={loaderData.showPhone}
        map={loaderData.mapKey == null ? null : { apiKey: loaderData.mapKey, number: territory.number }}
        view={view}
        onViewChange={setView}
        before={
          canViewAttributions && (
            <TerritoryAttribution
              current={current}
              last={loaderData.last}
              availability={loaderData.availability}
              today={today}
              canManage={loaderData.canManageAttributions}
              canViewPublishers={loaderData.canViewPublishers}
              onReturn={() => setReturning(true)}
              onEdit={() => current && setPanel({ kind: 'attribution', id: current.id, trigger: null })}
              onAssign={() => setPanel({ kind: 'territory', id: territory.id, trigger: null })}
            />
          )
        }
        after={
          <>
            {canViewAttributions && loaderData.history.length > 0 && (
              <TerritoryHistory entries={loaderData.history} today={today} />
            )}
            {territory.notes.trim() !== '' && (
              <section className="flex flex-col gap-1.5">
                <h2 className="font-semibold text-sm">
                  {m.territory_page_notes()}{' '}
                  <span className="font-normal text-faint">· {m.attributions_panel_notes_hint()}</span>
                </h2>
                <p className="whitespace-pre-line text-muted-foreground text-sm">{territory.notes}</p>
              </section>
            )}
          </>
        }
        entranceAction={entrance => {
          const building = loaderData.buildingOf[entrance.id]
          return building == null ? null : (
            <Button asChild variant="ghost" size="icon-sm" title={m.territory_page_building()}>
              <Link to={`/territories/building/${building}/view`} aria-label={m.territory_page_building()}>
                <Building2 aria-hidden="true" />
              </Link>
            </Button>
          )
        }}
      />

      {panel && (
        <AttributionPanel
          key={`${panel.kind}-${panel.id}`}
          target={panel}
          docked={false}
          onRequestClose={() => setPanel(null)}
          onClose={() => setPanel(null)}
          walk={null}
        />
      )}
      <ReturnAttributionDialog
        attribution={
          returning && current
            ? {
                id: current.id,
                number: territory.number,
                holder: holderName(current.publisher),
                startDay: current.startDay,
                restDays: current.restDays,
              }
            : null
        }
        today={today}
        onOpenChange={open => setReturning(open)}
      />
      <DeleteTerritoryDialog
        territory={deleting}
        onOpenChange={open => {
          if (!open) setDeleting(null)
        }}
      />
    </div>
  )
}
