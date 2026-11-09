import { PeriodStepper } from '@unitae/ui'
import { Download, Users } from 'lucide-react'
import { useState } from 'react'
import { redirect, type ShouldRevalidateFunctionArgs, useSearchParams } from 'react-router'
import {
  ACTIVITY_FILTER_PARAM_NAMES,
  filterPublisherActivities,
  readActivityFiltersFromParams,
} from '~/features/publishers/model/filter-publisher-activities'
import { reportAccess } from '~/features/publishers/model/group-activity-access'
import { wasInactiveDuring } from '~/features/publishers/model/inactive'
import { previousMonth } from '~/features/publishers/model/previous-month'
import { reportStatus, summarizeReportMonth } from '~/features/publishers/model/report-month'
import { getPublisherWithActivities } from '~/features/publishers/server/get-publisher-with-activities.server'
import { listTheocraticYearsWithActivity } from '~/features/publishers/server/list-theocratic-years-with-activity.server'
import { ActivityGroupStrip, ActivityMonthSummary } from '~/features/publishers/ui/ActivityMonthSummary'
import { ActivityReportFilters } from '~/features/publishers/ui/ActivityReportFilters'
import { type ActivityReportRow, ActivityReportsTable } from '~/features/publishers/ui/ActivityReportsTable'
import { ActivityViewSwitch } from '~/features/publishers/ui/ActivityViewSwitch'
import { ExportActivityDialog } from '~/features/publishers/ui/ExportActivityDialog'
import { ReportPanel } from '~/features/publishers/ui/ReportPanel'
import { formatMonthYear } from '~/features/publishers/ui/report-month-format'
import { useOpenFromLink } from '~/features/publishers/ui/use-open-from-link'
import { useReportQueue } from '~/features/publishers/ui/use-report-queue'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { EmptyState } from '~/shared/ui/EmptyState'
import { useSideEditor } from '~/shared/ui/hooks/use-side-editor'
import { PageHeader } from '~/shared/ui/PageHeader'
import { DiscardChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { zonedNow } from '~/shared/utils/zoned-now'
import type { Route } from './+types/publisher-list'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.activity_list_meta_title() }]
}

export function shouldRevalidate({ currentUrl, nextUrl, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  if (currentUrl.pathname !== nextUrl.pathname) return defaultShouldRevalidate

  const clientOnlyChange = ACTIVITY_FILTER_PARAM_NAMES.some(name => {
    const before = currentUrl.searchParams.getAll(name).join(',')
    const after = nextUrl.searchParams.getAll(name).join(',')
    return before !== after
  })
  if (!clientOnlyChange) return defaultShouldRevalidate

  return ['month', 'year'].some(name => currentUrl.searchParams.get(name) !== nextUrl.searchParams.get(name))
}

/** The month asked for, when it is one; the congregation's current month otherwise. */
function requestedMonth(params: URLSearchParams, now: Date) {
  const month = Number(params.get('month'))
  const year = Number(params.get('year'))
  const valid = Number.isInteger(month) && month >= 0 && month <= 11 && Number.isInteger(year) && year >= 2000
  return params.has('month') && params.has('year') && valid
    ? { month, year, explicit: true }
    : { month: now.getMonth(), year: now.getFullYear(), explicit: false }
}

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  if (!permissions.has(Permission.CanViewActivity)) {
    logger.warn(
      `Try to load publishers' activities. User ID: ${currentUser.id}. Does NOT have rights to access publishers' activity.`,
    )
    throw redirect('/')
  }

  const now = zonedNow(context.get(congregationContext).timezone)
  let { month, year, explicit } = requestedMonth(new URL(request.url).searchParams, now)
  const member = currentUser.member
  const leader =
    member == null
      ? null
      : { responsibleForId: member.responsibleFor?.id ?? null, deputyForId: member.deputyFor?.id ?? null }

  return withScopeFromContext(context, async (db, congregationId) => {
    // Reports for a month come in early the next one: until the first arrives, the page opens on the month before.
    if (!explicit && (await db.publisherActivity.count({ where: { month, year } })) === 0) {
      ;({ month, year } = previousMonth({ month, year }))
    }

    const [members, publisherGroups, availableYears] = await Promise.all([
      getPublisherWithActivities(db, congregationId, month, year),
      db.publisherGroup.findMany({
        where: { congregationId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      listTheocraticYearsWithActivity(db, congregationId),
    ])

    const rows: ActivityReportRow[] = members.map(({ activities, publisherGroup, ...publisher }) => {
      const report = activities[0] ?? null
      const access = reportAccess({ permissions, leader, publisherGroupId: publisher.publisherGroupId })
      return {
        id: publisher.id,
        firstname: publisher.firstname,
        lastname: publisher.lastname,
        publisherGroup: publisherGroup && { id: publisherGroup.id, name: publisherGroup.name },
        wasInactive: wasInactiveDuring(publisher.inactiveAt, year, month),
        notRegular: report != null && !report.isPublisher && (report.hours ?? 0) === 0,
        editable: report == null ? access.canRecord : access.canCorrect,
        lastActivity: report && {
          id: report.id,
          type: report.type,
          isPublisher: report.isPublisher,
          hours: report.hours,
          studies: report.studies,
          notes: report.notes,
          creditHours: report.creditHours,
        },
      }
    })

    return {
      selectedMonth: { month, year },
      rows,
      summary: summarizeReportMonth(rows, (a, b) => a.localeCompare(b, getLocale(), { sensitivity: 'base' })),
      exportOptions: {
        publisherGroups,
        availableYears,
        defaultYear: month < 8 ? year - 1 : year,
        members: members.map(({ id, firstname, lastname }) => ({ id, firstname, lastname })),
      },
    }
  })
}

export default function ActivityReports({ loaderData }: Route.ComponentProps) {
  const { rows, summary, selectedMonth, exportOptions } = loaderData
  const [searchParams, setSearchParams] = useSearchParams()
  const [exportOpen, setExportOpen] = useState(false)
  const filters = readActivityFiltersFromParams(searchParams)
  const visible = filterPublisherActivities(rows, filters)
  const panel = useSideEditor<'report'>(target => rows.some(row => row.id === target.id))
  const target = panel.target
  const queue = useReportQueue({
    rows: visible,
    isMissing: row => row.editable && reportStatus(row) === 'missing',
    currentId: target?.id ?? null,
    onStep: row => panel.request({ kind: 'report', id: row.id, trigger: null }),
    onAdvance: row => panel.open({ kind: 'report', id: row.id, trigger: null }),
    onEnd: panel.close,
  })

  useOpenFromLink(publisherId => panel.open({ kind: 'report', id: publisherId, trigger: null }))

  const stepMonth = (delta: number) => {
    const index = selectedMonth.year * 12 + selectedMonth.month + delta
    setSearchParams(prev => {
      prev.set('month', String(index % 12))
      prev.set('year', String(Math.floor(index / 12)))
      return prev
    })
  }

  const header = (
    <PageHeader
      title={m.activity_page_title()}
      breadcrumbs={[{ label: m.activity_page_title() }]}
      actions={
        <Button variant="ghost" onClick={() => setExportOpen(true)} className="max-sm:hidden">
          <Download />
          {m.activity_export_button()}
        </Button>
      }
      controls={
        <>
          <ActivityViewSwitch value="reports" />
          <PeriodStepper
            label={formatMonthYear(selectedMonth.month, selectedMonth.year)}
            previous={{ label: m.activity_previous_month(), onClick: () => stepMonth(-1) }}
            next={{ label: m.activity_next_month(), onClick: () => stepMonth(1) }}
            labelWidth={132}
          />
        </>
      }
    />
  )

  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <EmptyState icon={Users} title={m.activity_empty_title()} description={m.activity_empty_description()} />
      </div>
    )
  }

  const reportPanel = target && (
    <ReportPanel
      key={`${target.id}:${selectedMonth.month}:${selectedMonth.year}`}
      target={{ publisherId: target.id ?? 0, ...selectedMonth, trigger: target.trigger }}
      docked={panel.docked}
      formRef={panel.formRef}
      onRequestClose={() => panel.request(null)}
      onClose={panel.close}
      onSaved={next => (next ? queue.advance() : panel.close())}
      queue={queue.position}
    />
  )

  return (
    // The marker lets the app shell stop clipping as a scroll container, so the docked panel can stick.
    <div data-sticky-content="" className="flex flex-col gap-5">
      {header}
      <ActivityMonthSummary summary={summary} />
      <ActivityGroupStrip
        groups={summary.groups}
        selectedId={filters.groupIds.length === 1 ? (filters.groupIds[0] ?? null) : null}
        onSelect={groupId =>
          setSearchParams(
            prev => {
              prev.delete('group')
              if (groupId != null) prev.set('group', String(groupId))
              return prev
            },
            { replace: true },
          )
        }
      />

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[3_1_560px] flex-col gap-3">
          <ActivityReportFilters filters={filters} rows={rows} groups={exportOptions.publisherGroups} />
          {visible.length === 0 ? (
            <EmptyState
              icon={Users}
              title={m.activity_filters_no_results_title()}
              description={m.activity_filters_no_results_description()}
            />
          ) : (
            <ActivityReportsTable
              rows={visible}
              selectedId={target?.id ?? null}
              onOpen={(row, trigger) => panel.request({ kind: 'report', id: row.id, trigger })}
            />
          )}
        </div>
        {panel.docked && reportPanel}
      </div>
      {!panel.docked && reportPanel}

      <DiscardChangesDialog
        {...panel.discard}
        description={m.common_discard_changes_description()}
        discardLabel={m.common_discard_changes_confirm()}
      />
      <ExportActivityDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        availableYears={exportOptions.availableYears}
        defaultYear={exportOptions.defaultYear}
        publisherGroups={exportOptions.publisherGroups}
        members={exportOptions.members}
      />
    </div>
  )
}
