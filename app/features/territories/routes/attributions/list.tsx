import { ClipboardList, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, redirect, useFetcher, useSearchParams } from 'react-router'
import { getGroups } from '~/features/publishers/index.server'
import {
  type AttributionListRow,
  type AttributionView,
  inAttributionView,
  parseAttributionView,
  sortAttributions,
  viewCounts,
} from '~/features/territories/model/attribution-list'
import { computeFilters } from '~/features/territories/server/attribution-filters.server'
import { listOpenAttributions } from '~/features/territories/server/attribution-list.queries'
import { listCampaigns } from '~/features/territories/server/campaign.queries'
import { resolveSearchPlace } from '~/features/territories/server/search-place.server'
import { getCurrentTheocraticYear } from '~/features/territories/server/theocratic-year.server'
import {
  type DialogAttribution,
  PANEL_ROUTE,
  ReturnAttributionDialog,
} from '~/features/territories/ui/AttributionDialogs'
import { AttributionPanel } from '~/features/territories/ui/AttributionPanel'
import { AttributionTable } from '~/features/territories/ui/AttributionTable'
import { AttributionToolbar } from '~/features/territories/ui/AttributionToolbar'
import { holderName } from '~/features/territories/ui/attribution-labels'
import GeocodeNotice from '~/features/territories/ui/GeocodeNotice'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { getBoolSetting } from '~/shared/domain/settings.server'
import { Permission } from '~/shared/types/permission'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { Button } from '~/shared/ui/button'
import { EmptyState } from '~/shared/ui/EmptyState'
import { useOpenParam } from '~/shared/ui/hooks/use-open-param'
import { useSideEditor } from '~/shared/ui/hooks/use-side-editor'
import { PageHeader } from '~/shared/ui/PageHeader'
import S13ExportButton from '~/shared/ui/S13ExportButton'
import { DiscardChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { formatLocalDate } from '~/shared/utils/date.server'
import { sortFromUrl } from '~/shared/utils/pagination.server'

import type { Route } from './+types/list'

export const meta: Route.MetaFunction = () => [{ title: m.attributions_meta_title() }]

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Permission.CanViewTerritoryAttributions)) {
    throw redirect(permissions.has(Permission.CanViewProspection) ? '/territories/buildings' : '/')
  }

  return withScopeFromContext(context, async (db, congregationId) => {
    const url = new URL(request.url)
    const today = formatLocalDate(new Date())
    const place = await resolveSearchPlace(url.searchParams.get('search') ?? '')
    const near = place.origin != null
    const sort = sortFromUrl(
      url,
      near ? ['date', 'number', 'proximity'] : ['date', 'number'],
      near ? 'proximity' : 'date',
    )
    const [phoneTypeActive, groups, campaigns, rows] = await Promise.all([
      getBoolSetting(db, TerritorySettingKey.TerritoryTypePhoneActive, congregationId),
      getGroups(db, congregationId),
      listCampaigns(db, congregationId),
      listOpenAttributions(db, congregationId, {
        where: computeFilters(url.searchParams),
        today,
        origin: place.origin ?? undefined,
      }),
    ])

    return {
      rows: sortAttributions(rows, sort, getLocale()),
      today,
      sort,
      proximity: near,
      geocodeNotice: place.notice,
      filtered: url.searchParams.has('search') || ['type', 'campaign', 'group'].some(key => url.searchParams.has(key)),
      phoneMethod: !phoneTypeActive,
      groups: groups.map(group => ({ id: group.id, name: group.name })),
      campaigns: campaigns.map(campaign => ({ id: campaign.id, name: campaign.name })),
      theocraticYear: getCurrentTheocraticYear(),
      canManage: permissions.has(Permission.CanManageTerritoryAttributions),
      canViewTerritories: permissions.has(Permission.CanViewTerritories),
    }
  })
}

export default function AttributionList({ loaderData }: Route.ComponentProps) {
  const { rows, today, canManage } = loaderData
  const [params, setParams] = useSearchParams()
  const view = parseAttributionView(params)
  const visible = rows.filter(row => inAttributionView(row.state, view))
  const panel = useSideEditor<'attribution'>(target => rows.some(row => row.id === target.id))
  const [returning, setReturning] = useState<DialogAttribution | null>(null)
  const resumer = useFetcher()

  useOpenParam('open', value => {
    const id = Number(value)
    if (canManage && Number.isInteger(id)) panel.open({ kind: 'attribution', id, trigger: null })
  })

  const chooseView = (next: AttributionView) =>
    setParams(
      prev => {
        for (const legacy of ['view', 'status', 'paused']) prev.delete(legacy)
        if (next !== 'all') prev.set('view', next)
        return prev
      },
      { replace: true, preventScrollReset: true },
    )

  const target = panel.target
  const index = target ? visible.findIndex(row => row.id === target.id) : -1
  const step = (delta: number) => {
    const next = visible[(index + delta + visible.length) % visible.length]
    if (next) panel.request({ kind: 'attribution', id: next.id, trigger: null })
  }
  const attributionPanel = target && (
    <AttributionPanel
      key={target.id}
      target={{ kind: 'attribution', id: target.id ?? 0, trigger: target.trigger }}
      docked={panel.docked}
      formRef={panel.formRef}
      onRequestClose={() => panel.request(null)}
      onClose={panel.close}
      walk={
        index >= 0
          ? { position: index + 1, total: visible.length, onPrevious: () => step(-1), onNext: () => step(1) }
          : null
      }
    />
  )

  const assign = canManage && (
    <Button asChild size="sm">
      <Link to="/territories/attributions/new/available-territories">
        <Plus aria-hidden="true" />
        {m.attributions_assign_button()}
      </Link>
    </Button>
  )

  return (
    // The marker lets the app shell stop clipping as a scroll container, so the docked panel can stick.
    <div data-sticky-content="" className="flex flex-col gap-4">
      <PageHeader
        title={m.attributions_title()}
        breadcrumbs={[{ label: m.sidebar_attributions() }]}
        actions={
          <>
            <S13ExportButton theocraticYear={loaderData.theocraticYear} />
            {assign}
          </>
        }
      />
      <GeocodeNotice notice={loaderData.geocodeNotice} />

      {rows.length === 0 && !loaderData.filtered ? (
        <EmptyState
          icon={ClipboardList}
          title={m.attributions_empty_title()}
          description={m.attributions_empty_description()}
          action={assign || undefined}
        />
      ) : (
        <div className="flex flex-wrap items-start gap-6">
          <div className="flex min-w-0 flex-[3_1_560px] flex-col gap-3">
            <AttributionToolbar
              view={view}
              counts={viewCounts(rows.map(row => row.state))}
              onView={chooseView}
              sort={loaderData.sort}
              proximity={loaderData.proximity}
              phoneMethod={loaderData.phoneMethod}
              groups={loaderData.groups}
              campaigns={loaderData.campaigns}
            />
            {visible.length === 0 ? (
              <p className="rounded-lg border border-border bg-card px-4 py-5 text-muted-foreground text-sm">
                {emptyViewText(view, loaderData.filtered)}
              </p>
            ) : (
              <AttributionTable
                rows={visible}
                today={today}
                selectedId={target?.id ?? null}
                canManage={canManage}
                canViewTerritories={loaderData.canViewTerritories}
                onOpen={(row, trigger) => panel.request({ kind: 'attribution', id: row.id, trigger })}
                onReturn={row => setReturning(dialogOf(row))}
                onResume={row =>
                  resumer.submit({ intent: 'resume', id: row.id }, { method: 'post', action: PANEL_ROUTE })
                }
              />
            )}
          </div>
          {panel.docked && attributionPanel}
        </div>
      )}
      {!panel.docked && attributionPanel}

      <ReturnAttributionDialog
        attribution={returning}
        today={today}
        onOpenChange={open => {
          if (!open) setReturning(null)
        }}
      />
      <DiscardChangesDialog
        {...panel.discard}
        description={m.common_discard_changes_description()}
        discardLabel={m.common_discard_changes_confirm()}
      />
    </div>
  )
}

function dialogOf(row: AttributionListRow): DialogAttribution {
  return {
    id: row.id,
    number: row.territory.number,
    holder: holderName(row.publisher),
    startDay: row.startDay,
    restDays: row.restDays,
  }
}

function emptyViewText(view: AttributionView, filtered: boolean): string {
  if (view === 'late') return m.attributions_view_empty_late()
  if (view === 'paused') return m.attributions_view_empty_paused()
  if (view === 'orphaned') return m.attributions_view_empty_orphaned()
  return filtered ? m.attributions_filtered_empty() : m.attributions_empty_title()
}
