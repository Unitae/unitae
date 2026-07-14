import { ChevronLeft, ChevronRight, Download, Users } from 'lucide-react'
import { useState } from 'react'
import { redirect, useSearchParams } from 'react-router'
import { wasInactiveDuring } from '~/features/publishers/model/inactive'
import { previousMonth } from '~/features/publishers/model/previous-month'
import { getPublisherStats } from '~/features/publishers/server/get-publisher-stats.server'
import { getPublisherWithActivities } from '~/features/publishers/server/get-publisher-with-activities.server'
import { listTheocraticYearsWithActivity } from '~/features/publishers/server/list-theocratic-years-with-activity.server'
import { ExportActivityDialog } from '~/features/publishers/ui/ExportActivityDialog'
import { PublisherActivityRow } from '~/features/publishers/ui/PublisherActivityRow'
import PublisherActivityStats from '~/features/publishers/ui/PublisherActivityStats'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '~/shared/ui/table'
import type { Route } from './+types/publisher-list'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.activity_list_meta_title() }]
}

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const canViewActivities = permissions.has(Permission.ActivityViewer)
  const canManageActivities = permissions.has(Permission.ActivityManager)

  if (!canViewActivities) {
    logger.warn(
      `Try to load publishers' activities. User ID: ${currentUser.id}. Does NOT have rights to access publishers' activity.`,
    )
    throw redirect('/')
  }

  logger.info(`Loading publishers' activities. User ID: ${currentUser.id}.`)

  const timeRange = new Date()
  const searchParams = new URL(request.url).searchParams
  const hasExplicitSelection = searchParams.has('month') || searchParams.has('year')
  let month = Number(searchParams.get('month') ?? timeRange.getMonth())
  let year = Number(searchParams.get('year') ?? timeRange.getFullYear())

  return withScopeFromContext(context, async db => {
    if (!hasExplicitSelection) {
      const currentMonthActivityCount = await db.publisherActivity.count({ where: { month, year } })
      if (currentMonthActivityCount === 0) {
        ;({ month, year } = previousMonth({ month, year }))
      }
    }

    const [users, publisherGroups, availableYears] = await Promise.all([
      getPublisherWithActivities(db, currentUser.congregationId, month, year),
      db.publisherGroup.findMany({
        where: { congregationId: currentUser.congregationId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      listTheocraticYearsWithActivity(db, currentUser.congregationId),
    ])

    return {
      firstMonth: {
        month: 8,
        year: month < 8 ? year - 1 : year,
      },
      selectedMonth: {
        month,
        year,
      },
      stats: await getPublisherStats(db, currentUser.congregationId, month, year),
      publishers: users
        .map(({ activities, ...member }) => ({
          ...member,
          lastActivity: activities.length < 1 ? null : activities[0],
          wasInactive: wasInactiveDuring(member.inactiveAt, year, month),
          notRegular:
            activities[0] != null &&
            activities[0].isPublisher === false &&
            (activities[0].hours == null || activities[0].hours === 0),
        }))
        .map(publisher => ({
          ...publisher,
          newActivityUrl: `./new?publisherId=${publisher.id}&month=${month}&year=${year}`,
          editActivityUrl: `./${publisher.lastActivity?.id}/edit`,
        })),
      exportOptions: {
        publisherGroups,
        availableYears,
        members: users.map(({ id, firstname, lastname }) => ({ id, firstname, lastname })),
      },
      canManageActivities,
    }
  })
}

export default function NewActivity({ loaderData }: Route.ComponentProps) {
  const { publishers, selectedMonth, firstMonth, stats, canManageActivities, exportOptions } = loaderData
  const [searchParams, setSearchParams] = useSearchParams()
  const [exportOpen, setExportOpen] = useState(false)
  const selectedDate = new Date()
  selectedDate.setMonth(selectedMonth.month)
  selectedDate.setFullYear(selectedMonth.year)

  const handleMonthIncrease = () => {
    searchParams.set('month', String(selectedMonth.month === 11 ? 0 : selectedMonth.month + 1))
    searchParams.set('year', String(selectedMonth.month === 11 ? selectedMonth.year + 1 : selectedMonth.year))
    setSearchParams(searchParams)
  }
  const handleMonthDecrease = () => {
    searchParams.set('month', String(selectedMonth.month === 0 ? 11 : selectedMonth.month - 1))
    searchParams.set('year', String(selectedMonth.month === 0 ? selectedMonth.year - 1 : selectedMonth.year))
    setSearchParams(searchParams)
  }

  if (publishers.length < 1) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title={m.activity_list_title()}
          subtitle={m.activity_list_subtitle()}
          breadcrumbs={[{ label: m.activity_list_title() }]}
        />

        <EmptyState icon={Users} title={m.activity_empty_title()} description={m.activity_empty_description()} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.activity_list_title()}
        subtitle={m.activity_list_subtitle()}
        breadcrumbs={[{ label: m.activity_list_title() }]}
        actions={
          <>
            <Button
              variant="outline"
              size="icon"
              title={m.activity_export_button_title()}
              className="max-sm:hidden"
              onClick={() => setExportOpen(true)}
            >
              <Download className="size-4" />
            </Button>
            <ExportActivityDialog
              open={exportOpen}
              onOpenChange={setExportOpen}
              availableYears={exportOptions.availableYears}
              defaultYear={firstMonth.year}
              publisherGroups={exportOptions.publisherGroups}
              members={exportOptions.members}
            />
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={handleMonthDecrease}>
                <ChevronLeft className="size-4" />
              </Button>
              <span className="min-w-[120px] text-center font-medium text-sm sm:min-w-[140px]">
                {selectedDate.toLocaleDateString('fr', {
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
              <Button variant="ghost" size="icon" onClick={handleMonthIncrease}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </>
        }
      />

      <PublisherActivityStats stats={stats} />

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-center max-sm:text-left">{m.activity_table_firstname()}</TableHead>
              <TableHead className="text-center">{m.activity_table_lastname()}</TableHead>
              <TableHead className="text-center">{m.activity_table_group()}</TableHead>
              <TableHead className="text-center max-sm:hidden">{m.activity_table_hours()}</TableHead>
              <TableHead className="text-center max-sm:hidden">{m.activity_table_studies()}</TableHead>
              <TableHead className="text-center max-sm:hidden">{m.activity_table_pioneer()}</TableHead>
              <TableHead className="text-center max-sm:hidden">{m.activity_table_observations()}</TableHead>
              {canManageActivities && (
                <TableHead className="w-0">
                  <span className="sr-only">Actions</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {publishers.map(publisher => (
              <PublisherActivityRow
                key={publisher.id}
                publisher={publisher}
                canManageActivities={canManageActivities}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
