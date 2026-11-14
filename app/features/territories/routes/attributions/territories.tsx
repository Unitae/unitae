import { MapIcon } from 'lucide-react'
import { useSearchParams } from 'react-router'
import {
  type AssignableView,
  assignableCounts,
  isFreeToday,
  parseAssignableSort,
  sortAssignable,
} from '~/features/territories/model/assignable-territories'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { listAssignableTerritories } from '~/features/territories/server/assignable-territories.queries'
import { getZips } from '~/features/territories/server/buildings.server'
import { getActiveCampaign } from '~/features/territories/server/campaign.queries'
import { resolveSearchPlace } from '~/features/territories/server/search-place.server'
import { computeFilters } from '~/features/territories/server/territory-filters.server'
import { AssignableTerritoryTable } from '~/features/territories/ui/AssignableTerritoryTable'
import { AssignableToolbar } from '~/features/territories/ui/AssignableToolbar'
import { AttributionPanel } from '~/features/territories/ui/AttributionPanel'
import GeocodeNotice from '~/features/territories/ui/GeocodeNotice'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { permissionsContext, requirePermission, withScopeFromContext } from '~/shared/auth/route-context.server'
import { getBoolSetting } from '~/shared/domain/settings.server'
import { Permission } from '~/shared/types/permission'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { EmptyState } from '~/shared/ui/EmptyState'
import { useOpenParam } from '~/shared/ui/hooks/use-open-param'
import { useSideEditor } from '~/shared/ui/hooks/use-side-editor'
import { ListWithPanel } from '~/shared/ui/ListWithPanel'
import { PageHeader } from '~/shared/ui/PageHeader'
import { DiscardChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { formatLocalDate } from '~/shared/utils/date.server'

import type { Route } from './+types/territories'

const FILTER_PARAMS = ['search', 'type', 'zip', 'access', 'pmr']

export const meta: Route.MetaFunction = () => [{ title: m.attributions_new_meta_title() }]

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanManageTerritoryAttributions)

  return withScopeFromContext(context, async (db, congregationId) => {
    const url = new URL(request.url)
    const today = formatLocalDate(new Date())
    const place = await resolveSearchPlace(url.searchParams.get('search') ?? '')
    const sort = parseAssignableSort(url.searchParams, place.origin != null)
    const [pmrActive, campaign, zips] = await Promise.all([
      getBoolSetting(db, TerritorySettingKey.PmrActive, congregationId),
      getActiveCampaign(db, congregationId),
      getZips(db, congregationId),
    ])
    const rows = await listAssignableTerritories(db, congregationId, {
      where: computeFilters(url.searchParams),
      today,
      campaignMode: campaign != null,
      origin: place.origin ?? undefined,
    })

    return {
      rows: sortAssignable(rows, sort, getLocale()),
      today,
      sort,
      proximity: place.origin != null,
      geocodeNotice: place.notice,
      pmrActive: pmrActive ?? false,
      zips: zips.map(row => row.zip).sort(),
      filtered: FILTER_PARAMS.some(param => url.searchParams.has(param)),
      // The list of attributions is a right of its own: the way back goes there only for those who may read it.
      canViewAttributions: permissions.has(Permission.CanViewTerritoryAttributions),
    }
  })
}

export default function AssignTerritory({ loaderData }: Route.ComponentProps) {
  const { rows, today } = loaderData
  const [params, setParams] = useSearchParams()
  const view: AssignableView = params.get('view') === 'all' ? 'all' : 'free'
  const visible = view === 'all' ? rows : rows.filter(row => isFreeToday(row.availability))
  const panel = useSideEditor<'territory'>(target => rows.some(row => row.id === target.id))
  const target = panel.target
  const walk = panel.walk(
    'territory',
    visible.map(row => row.id),
  )

  useOpenParam('open', value => {
    const id = Number(value)
    if (Number.isInteger(id)) panel.open({ kind: 'territory', id, trigger: null })
  })

  const assignPanel = target && (
    <AttributionPanel
      key={target.id}
      target={{ kind: 'territory', id: target.id ?? 0, trigger: target.trigger }}
      docked={panel.docked}
      formRef={panel.formRef}
      onRequestClose={() => panel.request(null)}
      onClose={panel.close}
      walk={walk}
    />
  )

  return (
    <div data-sticky-content="" className="flex flex-col gap-4">
      <PageHeader
        title={m.attributions_assign_title()}
        subtitle={m.attributions_assign_subtitle()}
        breadcrumbs={[
          loaderData.canViewAttributions
            ? { label: m.sidebar_attributions(), to: '/territories/attributions' }
            : { label: m.sidebar_attributions() },
          { label: m.attributions_assign_title() },
        ]}
      />
      <GeocodeNotice notice={loaderData.geocodeNotice} />

      <ListWithPanel panel={panel.docked ? assignPanel : null} onPanelKeyDown={walk?.onKeyDown}>
        <AssignableToolbar
          view={view}
          counts={assignableCounts(rows)}
          onView={next =>
            setParams(
              prev => {
                if (next === 'all') prev.set('view', 'all')
                else prev.delete('view')
                return prev
              },
              { replace: true, preventScrollReset: true },
            )
          }
          sort={loaderData.sort}
          proximity={loaderData.proximity}
          kinds={Object.values(TerritoryKindKey)}
          zips={loaderData.zips}
          pmrActive={loaderData.pmrActive}
        />
        {visible.length === 0 ? (
          loaderData.filtered ? (
            <p className="rounded-lg border border-border bg-card px-4 py-5 text-muted-foreground text-sm">
              {m.attributions_assign_filtered_empty()}
            </p>
          ) : (
            <EmptyState
              icon={MapIcon}
              title={m.attributions_assign_empty_title()}
              description={m.attributions_assign_empty_description()}
            />
          )
        ) : (
          <AssignableTerritoryTable
            rows={visible}
            today={today}
            selectedId={target?.id ?? null}
            pmrActive={loaderData.pmrActive}
            onAssign={(row, trigger) => panel.request({ kind: 'territory', id: row.id, trigger })}
          />
        )}
      </ListWithPanel>
      {!panel.docked && assignPanel}

      <DiscardChangesDialog
        {...panel.discard}
        description={m.common_discard_changes_description()}
        discardLabel={m.common_discard_changes_confirm()}
      />
    </div>
  )
}
