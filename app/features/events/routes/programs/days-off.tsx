import { redirect, type ShouldRevalidateFunctionArgs } from 'react-router'

import { listPeriod, selectedPreset } from '~/features/events/model/list-period'
import { assignKey, conflictAction, type ReassignRights, reassignHref } from '~/features/events/model/reassign'
import { ResponsibilityScope } from '~/features/events/model/responsibility-scope.type'
import { congregationHasAbsences, listCongregationAbsences } from '~/features/events/server/days-off.queries'
import { getResponsibleTemplateIds } from '~/features/events/server/events-auth.server'
import { PeriodMenu } from '~/features/events/ui/PeriodMenu'
import { ProgrammeAbsences } from '~/features/events/ui/ProgrammeAbsences'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { PageHeader } from '~/shared/ui/PageHeader'
import { dayOf, endOfDay, startOfDay } from '~/shared/utils/calendar-day'
import { formatPersonName } from '~/shared/utils/format-person-name'

import type { Route } from './+types/days-off'

const PERIOD_PARAMS = ['period', 'from', 'to']

export const meta: Route.MetaFunction = () => {
  return [{ title: m.programs_absences_meta_title() }]
}

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  // Seeing other people's absences is its own capability. It used to be enough to hold
  // can-view-programs, which meant the absence permission could never restrict anything.
  if (!permissions.has(Permission.CanViewAbsences)) {
    logger.warn(`Try to load absences. User ID: ${currentUser.id}. Does NOT have rights to access absences.`)
    throw redirect('/')
  }

  const { timezone } = context.get(congregationContext)
  const now = new Date()
  const today = dayOf(now, timezone)
  const period = listPeriod(new URL(request.url).searchParams, today)
  const canViewPrograms = permissions.has(Permission.CanViewPrograms)
  const canAssignParts = permissions.has(Permission.CanAssignProgramParts)

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    // Responsible of a template: the event's page lets them fill its slots without the right to assign.
    const responsibleFor = (scope: ResponsibilityScope) =>
      canViewPrograms && !canAssignParts ? getResponsibleTemplateIds(db, currentUser.id, congregationId, scope) : []
    const [absences, hasAnyAbsence, partTemplateIds, serviceTemplateIds] = await Promise.all([
      listCongregationAbsences(db, {
        congregationId,
        from: startOfDay(period.from, timezone),
        to: endOfDay(period.to, timezone),
      }),
      congregationHasAbsences(db, congregationId),
      responsibleFor(ResponsibilityScope.Programme),
      responsibleFor(ResponsibilityScope.Service),
    ])
    const rights: ReassignRights = { canViewPrograms, canAssignParts, partTemplateIds, serviceTemplateIds }
    const canOpenRecords = permissions.has(Permission.CanViewPublishers)

    return {
      // Only what the page shows: no template ids, and a link only where the reader may follow it.
      absences: absences.map(absence => ({
        id: absence.id,
        startDate: absence.startDate,
        endDate: absence.endDate,
        declaredAt: absence.declaredAt,
        name: formatPersonName(absence),
        recordHref: canOpenRecords && absence.memberId != null ? `/publishers/${absence.memberId}/view` : null,
        conflicts: absence.conflicts.map(conflict => {
          const action = conflictAction(conflict, rights)
          return {
            key: assignKey(conflict),
            name: conflict.name,
            eventDate: conflict.eventDate,
            href: reassignHref(conflict, action),
            action,
            published: conflict.published,
          }
        }),
      })),
      period,
      preset: selectedPreset(period, today),
      today,
      now,
      hasAnyAbsence,
      canViewPrograms,
      // Absences cover whole days in the congregation's zone: weeks and days are read there.
      timeZone: timezone,
    }
  })
}

// The search and « À revoir » narrow the loaded list in the page: only a new period reads the database again.
export function shouldRevalidate({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (formMethod != null || currentUrl.pathname !== nextUrl.pathname) return defaultShouldRevalidate
  const periodOf = (url: URL) => PERIOD_PARAMS.map(name => url.searchParams.get(name)).join('|')
  return periodOf(currentUrl) !== periodOf(nextUrl)
}

export default function ProgrammeAbsencesPage({ loaderData }: Route.ComponentProps) {
  const { absences, period, preset, today, now, hasAnyAbsence, canViewPrograms, timeZone } = loaderData
  const conflicts = absences.reduce((total, absence) => total + absence.conflicts.length, 0)

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <PageHeader
        title={m.programs_absences_title()}
        titleBadge={
          absences.length > 0 ? (
            <span className="text-base text-faint tabular-nums">
              {m.programs_absences_count({ count: absences.length })}
              {conflicts > 0 && ` · ${m.programs_absences_review({ count: conflicts })}`}
            </span>
          ) : undefined
        }
        subtitle={m.programs_absences_subtitle()}
        breadcrumbs={
          canViewPrograms
            ? [{ label: m.sidebar_programs(), to: '/programs' }, { label: m.sidebar_absences() }]
            : [{ label: m.sidebar_absences() }]
        }
        controls={hasAnyAbsence ? <PeriodMenu period={period} preset={preset} today={today} /> : undefined}
      />
      <ProgrammeAbsences
        absences={absences}
        period={period}
        preset={preset}
        hasAnyAbsence={hasAnyAbsence}
        timeZone={timeZone}
        now={new Date(now)}
      />
    </div>
  )
}
