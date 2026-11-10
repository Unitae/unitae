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
import { BuildingSyncDialog } from '~/features/territories/ui/BuildingSyncDialog'
import { BuildingSyncStatus } from '~/features/territories/ui/BuildingSyncStatus'
import { type BuildingListItem, BuildingTable } from '~/features/territories/ui/BuildingTable'
import { BuildingToolbar } from '~/features/territories/ui/BuildingToolbar'
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

export default function ProspectionList({ loaderData }: Route.ComponentProps) {
  const { rows, counts, view, canManage } = loaderData
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
  const { sync } = loaderData
  const actions = ((loaderData.canSync && sync) || create) && (
    <>
      {loaderData.canSync && sync && (
        <BuildingSyncDialog facts={sync.facts} today={loaderData.today} running={sync.run?.status === 'Running'} />
      )}
      {create}
    </>
  )

  return (
    <div className="flex max-w-6xl flex-col gap-4">
      <PageHeader
        title={m.prospection_title()}
        breadcrumbs={[{ label: m.sidebar_prospection() }]}
        actions={actions || undefined}
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
        <>
          <BuildingToolbar
            view={view}
            counts={counts}
            onView={chooseView}
            sort={loaderData.sort}
            zips={loaderData.zips}
          />
          <ViewNote view={view} validity={loaderData.validity} />
          {rows.length === 0 ? (
            <p className="rounded-lg border border-border bg-card px-4 py-5 text-muted-foreground text-sm">
              {loaderData.filtered ? m.prospection_filtered_empty() : emptyViewText(view)}
            </p>
          ) : (
            <>
              <BuildingTable
                rows={rows}
                view={view}
                today={loaderData.today}
                canSurvey={loaderData.canSurvey}
                canManage={canManage}
              />
              <BuildingListFooter
                page={loaderData.page}
                pages={loaderData.pages}
                pageSize={loaderData.pageSize}
                total={loaderData.total}
              />
            </>
          )}
        </>
      )}
    </div>
  )
}

/** What a work list holds and why, under the toolbar. */
function ViewNote({ view, validity }: { view: BuildingView; validity: number }) {
  const note =
    view === 'check'
      ? validity > 0
        ? m.prospection_note_check({ months: validity })
        : m.prospection_note_check_no_validity()
      : view === 'new'
        ? m.prospection_note_new()
        : view === 'missing'
          ? m.prospection_note_missing()
          : null
  return note ? <p className="max-w-3xl text-muted-foreground text-sm">{note}</p> : null
}

function emptyViewText(view: BuildingView): string {
  if (view === 'check') return m.prospection_view_empty_check()
  if (view === 'new') return m.prospection_view_empty_new()
  if (view === 'missing') return m.prospection_view_empty_missing()
  return m.prospection_view_empty_active()
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
