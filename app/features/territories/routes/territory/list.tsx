import { MapIcon, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import {
  inTerritoryView,
  parseTerritorySort,
  parseTerritoryView,
  sortTerritories,
  type TerritoryView,
  territoryViewCounts,
} from '~/features/territories/model/territory-list'
import { getActiveCampaign } from '~/features/territories/server/campaign.queries'
import { resolveSearchPlace } from '~/features/territories/server/search-place.server'
import { computeFilters } from '~/features/territories/server/territory-filters.server'
import { listTerritoryRows } from '~/features/territories/server/territory-list.queries'
import GeocodeNotice from '~/features/territories/ui/GeocodeNotice'
import { DeleteTerritoryDialog, type TerritoryTarget } from '~/features/territories/ui/TerritoryActions'
import { TerritoryTable } from '~/features/territories/ui/TerritoryTable'
import { TerritoryToolbar } from '~/features/territories/ui/TerritoryToolbar'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { permissionsContext, requirePermission, withScopeFromContext } from '~/shared/auth/route-context.server'
import { getBoolSetting } from '~/shared/domain/settings.server'
import { Permission } from '~/shared/types/permission'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { Button } from '~/shared/ui/button'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import { formatLocalDate } from '~/shared/utils/date.server'

import type { Route } from './+types/list'

export const meta: Route.MetaFunction = () => [{ title: m.territories_list_meta_title() }]

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanViewTerritories)
  const canViewAttributions = permissions.has(Permission.CanViewTerritoryAttributions)

  return withScopeFromContext(context, async (db, congregationId) => {
    const url = new URL(request.url)
    const today = formatLocalDate(new Date())
    const place = await resolveSearchPlace(url.searchParams.get('search') ?? '')
    const near = place.origin != null
    const [pmrActive, campaign] = await Promise.all([
      getBoolSetting(db, TerritorySettingKey.PmrActive, congregationId),
      getActiveCampaign(db, congregationId),
    ])
    const rows = await listTerritoryRows(db, congregationId, {
      where: computeFilters(url.searchParams),
      today,
      campaignMode: campaign != null,
      origin: place.origin ?? undefined,
    })
    // « Dernière attribution » reads the attributions: without their right, the list keeps its number order.
    const asked = parseTerritorySort(url.searchParams, near)
    const sort = asked === 'last' && !canViewAttributions ? 'number' : asked

    return {
      // Who holds a territory and since when is the attributions' business: without their right, none of it leaves.
      rows: sortTerritories(rows, sort, getLocale()).map(row =>
        canViewAttributions ? row : { ...row, holder: null, lastDay: null },
      ),
      today,
      sort,
      proximity: near,
      geocodeNotice: place.notice,
      pmrActive: pmrActive ?? false,
      filtered: ['search', 'type', 'pmr'].some(key => url.searchParams.has(key)),
      households: rows.reduce((sum, row) => sum + row.quantity.homes, 0),
      canViewAttributions,
      canManage: permissions.has(Permission.CanManageTerritories),
    }
  })
}

export default function TerritoryList({ loaderData }: Route.ComponentProps) {
  const { rows, today, canViewAttributions, canManage } = loaderData
  const [params, setParams] = useSearchParams()
  const view = canViewAttributions ? parseTerritoryView(params) : 'all'
  const visible = rows.filter(row => inTerritoryView(row, view))
  const [deleting, setDeleting] = useState<TerritoryTarget | null>(null)

  const chooseView = (next: TerritoryView) =>
    setParams(
      prev => {
        if (next === 'all') prev.delete('view')
        else prev.set('view', next)
        return prev
      },
      { replace: true, preventScrollReset: true },
    )

  const create = canManage && (
    <Button asChild size="sm">
      <Link to="/territories/territory/new">
        <Plus aria-hidden="true" />
        {m.territories_new_button()}
      </Link>
    </Button>
  )

  return (
    <div className="flex max-w-6xl flex-col gap-4">
      <PageHeader
        title={m.territories_title()}
        titleBadge={
          rows.length > 0 ? (
            <span className="text-base text-faint tabular-nums">
              {m.territories_households({ count: new Intl.NumberFormat(getLocale()).format(loaderData.households) })}
            </span>
          ) : undefined
        }
        breadcrumbs={[{ label: m.sidebar_territories() }]}
        actions={create || undefined}
      />
      <GeocodeNotice notice={loaderData.geocodeNotice} />

      {rows.length === 0 && !loaderData.filtered ? (
        <EmptyState
          icon={MapIcon}
          title={m.territories_empty_title()}
          description={m.territories_empty_description()}
          action={create || undefined}
        />
      ) : (
        <>
          <TerritoryToolbar
            view={view}
            counts={territoryViewCounts(rows)}
            onView={chooseView}
            sort={loaderData.sort}
            proximity={loaderData.proximity}
            pmrActive={loaderData.pmrActive}
            canViewAttributions={canViewAttributions}
          />
          {visible.length === 0 ? (
            <p className="rounded-lg border border-border bg-card px-4 py-5 text-muted-foreground text-sm">
              {m.territories_filtered_empty()}
            </p>
          ) : (
            <TerritoryTable
              rows={visible}
              today={today}
              from={params.toString()}
              pmrActive={loaderData.pmrActive}
              canViewAttributions={canViewAttributions}
              canManage={canManage}
              onDelete={setDeleting}
            />
          )}
        </>
      )}

      <DeleteTerritoryDialog
        territory={deleting}
        onOpenChange={open => {
          if (!open) setDeleting(null)
        }}
      />
    </div>
  )
}
