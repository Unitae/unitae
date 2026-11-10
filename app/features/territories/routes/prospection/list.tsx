import { Building2, Plus } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import {
  type BuildingView,
  checkDates,
  parseBuildingSort,
  parseBuildingView,
} from '~/features/territories/model/building-list'
import { countBuildingViews, listBuildingPage } from '~/features/territories/server/building-list.queries'
import { getBuildingSyncFacts, getBuildingSyncStatus } from '~/features/territories/server/building-sync.queries'
import { getZips } from '~/features/territories/server/buildings.server'
import { BuildingListFooter } from '~/features/territories/ui/BuildingListFooter'
import { BuildingSelectionBar } from '~/features/territories/ui/BuildingSelectionBar'
import { BuildingSyncDialog } from '~/features/territories/ui/BuildingSyncDialog'
import { BuildingSyncStatus } from '~/features/territories/ui/BuildingSyncStatus'
import { type BuildingListItem, BuildingTable } from '~/features/territories/ui/BuildingTable'
import { BuildingToolbar } from '~/features/territories/ui/BuildingToolbar'
import { BuildingViewNote, emptyViewText } from '~/features/territories/ui/BuildingViewNote'
import { useRowSelection } from '~/features/territories/ui/use-row-selection'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import {
  layoutGate,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { getSetting } from '~/shared/domain/settings.server'
import { Permission } from '~/shared/types/permission'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { Button } from '~/shared/ui/button'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import { formatLocalDate } from '~/shared/utils/date.server'

import type { Route } from './+types/list'

const PAGE_SIZE = 50
const FILTER_PARAMS = ['search', 'zip', 'type', 'access', 'position', 'shops']

export const meta: Route.MetaFunction = () => [{ title: m.prospection_meta_title() }]

// As a middleware, the gate covers the action too, not only the page.
export const middleware: Route.MiddlewareFunction[] = [
  layoutGate(permissions => permissions.has(Permission.CanViewProspection)),
]

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanViewProspection)
  const canManage = permissions.has(Permission.CanManageBuildings)

  return withScopeFromContext(context, async (db, congregationId) => {
    const params = new URL(request.url).searchParams
    const validity = Number((await getSetting(db, TerritorySettingKey.ProspectionValidity, congregationId)) ?? '0')
    const now = new Date()
    const dates = checkDates(validity, now)
    const view = parseBuildingView(params)
    const sort = parseBuildingSort(params)

    const list = await listBuildingPage(db, congregationId, {
      view,
      params,
      sort,
      page: Number(params.get('page')) || 1,
      pageSize: PAGE_SIZE,
      dates,
      locale: getLocale(),
    })
    const counts = await countBuildingViews(db, congregationId, { params, dates })
    const zips = await getZips(db, congregationId)
    const facts = await getBuildingSyncFacts(db, congregationId)
    const { latest, lastCompleted } = await getBuildingSyncStatus(db, congregationId, now)

    return {
      rows: list.rows.map(
        ({ prospectionDate, createdAt, ...row }): BuildingListItem => ({
          ...row,
          prospectionDay: prospectionDate ? formatLocalDate(prospectionDate) : null,
          createdDay: formatLocalDate(createdAt),
        }),
      ),
      page: list.page,
      pages: list.pages,
      pageSize: list.pageSize,
      total: list.total,
      counts,
      zips: zips.map(row => row.zip).sort(),
      view,
      sort,
      validity,
      today: formatLocalDate(now),
      filtered: FILTER_PARAMS.some(key => params.has(key)),
      canSurvey: permissions.has(Permission.CanRecordProspection),
      canManage,
      canSync: canManage && facts.sourceUrl != null,
      // The status line shows once a file is set or a sync has run; the dialog, to who may sync.
      sync:
        facts.sourceUrl == null && latest == null
          ? null
          : {
              run: latest && {
                status: latest.status,
                progress: latest.progress,
                startedDay: formatLocalDate(latest.startedAt),
                createdCount: latest.createdCount,
                missingCount: latest.missingCount,
                error: latest.error,
                startedBy: latest.startedBy,
              },
              facts: {
                source: sourceLabel(facts.sourceUrl),
                zips: facts.zips,
                perimeter: facts.perimeter,
                last: lastCompleted && {
                  day: formatLocalDate(lastCompleted.startedAt),
                  createdCount: lastCompleted.createdCount,
                  missingCount: lastCompleted.missingCount,
                },
              },
            },
    }
  })
}

type LoaderData = Route.ComponentProps['loaderData']

export default function ProspectionList({ loaderData }: Route.ComponentProps) {
  const { counts, canManage, sync } = loaderData
  const [, setParams] = useSearchParams()

  const chooseView = (next: BuildingView) =>
    setParams(
      prev => {
        if (next === 'active') prev.delete('view')
        else prev.set('view', next)
        prev.delete('page')
        return prev
      },
      { replace: true, preventScrollReset: true },
    )

  const create = canManage && (
    <Button asChild size="sm">
      <Link to="/territories/building/new">
        <Plus aria-hidden="true" />
        {m.prospection_new_building_button()}
      </Link>
    </Button>
  )
  const syncButton = loaderData.canSync && sync && (
    <BuildingSyncDialog facts={sync.facts} today={loaderData.today} running={sync.run?.status === 'Running'} />
  )

  return (
    <div className="flex max-w-6xl flex-col gap-4">
      <PageHeader
        title={m.prospection_title()}
        breadcrumbs={[{ label: m.sidebar_prospection() }]}
        actions={
          syncButton || create ? (
            <>
              {syncButton}
              {create}
            </>
          ) : undefined
        }
        meta={
          sync && (
            <BuildingSyncStatus
              run={sync.run}
              today={loaderData.today}
              canSync={loaderData.canSync}
              onView={chooseView}
            />
          )
        }
      />
      {counts.all === 0 && !loaderData.filtered ? (
        <EmptyState
          icon={Building2}
          title={m.prospection_empty_title()}
          description={m.prospection_empty_description()}
          action={create || undefined}
        />
      ) : (
        <BuildingList data={loaderData} onView={chooseView} />
      )}
    </div>
  )
}

/** The toolbar, what the view holds, the rows and the footer; the selection bar while rows are ticked. */
function BuildingList({ data, onView }: { data: LoaderData; onView: (view: BuildingView) => void }) {
  const { rows, view, canManage } = data
  const [params] = useSearchParams()
  const selection = useRowSelection(rows, view === 'missing' && canManage)

  return (
    <>
      <BuildingToolbar view={view} counts={data.counts} onView={onView} sort={data.sort} zips={data.zips} />
      <BuildingViewNote view={view} validity={data.validity} />
      {rows.length === 0 ? (
        <p className="rounded-lg border border-border bg-card px-4 py-5 text-muted-foreground text-sm">
          {data.filtered ? m.prospection_filtered_empty() : emptyViewText(view)}
        </p>
      ) : (
        <>
          <BuildingTable
            rows={rows}
            view={view}
            today={data.today}
            canSurvey={data.canSurvey}
            canManage={canManage}
            from={params.toString()}
            selection={selection.enabled ? selection : undefined}
          />
          <BuildingListFooter page={data.page} pages={data.pages} pageSize={data.pageSize} total={data.total} />
          {selection.ids.size > 0 && (
            <BuildingSelectionBar selected={rows.filter(row => selection.ids.has(row.id))} onClear={selection.clear} />
          )}
        </>
      )}
    </>
  )
}

/** « bano.openstreetmap.fr · bano-93.csv »: the host and the file, as the settings show them. */
function sourceLabel(url: string | null): string {
  if (url == null) return ''
  try {
    const parsed = new URL(url)
    const file = parsed.pathname.split('/').filter(Boolean).at(-1)
    return file ? `${parsed.host} · ${file}` : parsed.host
  } catch {
    return url
  }
}
