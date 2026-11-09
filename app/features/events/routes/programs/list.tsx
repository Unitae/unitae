import { Plus } from 'lucide-react'
import { Link, redirect, type ShouldRevalidateFunctionArgs } from 'react-router'

import { EventStatus } from '~/features/events/model/event-status.type'
import { listPeriod, selectedPreset } from '~/features/events/model/list-period'
import { type ProgrammeViewer, programmeRights } from '~/features/events/model/programme-access'
import { ResponsibilityScope } from '~/features/events/model/responsibility-scope.type'
import { getResponsibleTemplateIds } from '~/features/events/server/events-auth.server'
import { congregationHasProgrammes, listProgrammes } from '~/features/events/server/programme-list.queries'
import { PeriodMenu } from '~/features/events/ui/PeriodMenu'
import { ProgrammeList } from '~/features/events/ui/ProgrammeList'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { PageHeader } from '~/shared/ui/PageHeader'
import { dayOf, endOfDay, startOfDay } from '~/shared/utils/calendar-day'

import type { Route } from './+types/list'

const PERIOD_PARAMS = ['period', 'from', 'to']

export const meta: Route.MetaFunction = () => {
  return [{ title: m.programs_meta_title() }]
}

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  if (!permissions.has(Permission.CanViewPrograms)) {
    logger.warn(`Try to load programs. User ID: ${currentUser.id}. Does NOT have rights to access programs.`)
    throw redirect('/')
  }

  const { timezone } = context.get(congregationContext)
  const now = new Date()
  const today = dayOf(now, timezone)
  const period = listPeriod(new URL(request.url).searchParams, today)
  const canManage = permissions.has(Permission.CanManagePrograms)
  const canPublish = permissions.has(Permission.CanPublishPrograms)
  const canAssign = permissions.has(Permission.CanAssignProgramParts)

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    // The templates the reader runs give them rights on those programmes alone.
    const responsibleFor = (scope: ResponsibilityScope) =>
      canManage && canPublish && canAssign ? [] : getResponsibleTemplateIds(db, currentUser.id, congregationId, scope)
    const [programmeTemplateIds, serviceTemplateIds] = await Promise.all([
      responsibleFor(ResponsibilityScope.Programme),
      responsibleFor(ResponsibilityScope.Service),
    ])
    const viewer: ProgrammeViewer = { canManage, canPublish, canAssign, programmeTemplateIds, serviceTemplateIds }
    const [items, hasAnyProgramme] = await Promise.all([
      listProgrammes(db, {
        congregationId,
        from: startOfDay(period.from, timezone),
        to: endOfDay(period.to, timezone),
      }),
      congregationHasProgrammes(db, congregationId, {
        withDrafts: canManage || canPublish || canAssign || serviceTemplateIds.length > 0,
      }),
    ])

    // Only what the page shows: no template ids, drafts only for whoever may act on them, and the assignments to
    // review only for whoever may reassign them, until the programme is held.
    const programmes = items.flatMap(item => {
      const rights = programmeRights(item, viewer)
      if (item.status === EventStatus.Draft && !rights.canSeeDraft) return []
      const ahead = item.startDate >= now
      const review = ahead
        ? (rights.canAssignParts ? item.parts.flagged : 0) + (rights.canAssignServices ? item.services.flagged : 0)
        : 0
      return [
        {
          id: item.id,
          name: item.name,
          startDate: item.startDate,
          endDate: item.endDate,
          status: item.status,
          kind: item.kind,
          parts: { total: item.parts.total, filled: item.parts.filled },
          services: { total: item.services.total, filled: item.services.filled },
          review,
          canEdit: rights.canEdit,
          canPublish: rights.canPublish,
        },
      ]
    })

    return {
      programmes,
      period,
      preset: selectedPreset(period, today),
      today,
      now,
      hasAnyProgramme,
      canCreate: canManage || programmeTemplateIds.length > 0,
      timeZone: timezone,
    }
  })
}

// The filters narrow the loaded list in the page: only a new period, or a bulk action, reads the database again.
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

export default function ProgramListPage({ loaderData }: Route.ComponentProps) {
  const { programmes, period, preset, today, now, hasAnyProgramme, canCreate, timeZone } = loaderData
  const drafts = programmes.filter(row => row.status === EventStatus.Draft).length
  const review = programmes.reduce((total, row) => total + row.review, 0)
  const facts = [
    programmes.length > 1
      ? m.programs_count_other({ count: programmes.length })
      : m.programs_count_one({ count: programmes.length }),
    drafts > 0 &&
      (drafts > 1 ? m.programs_drafts_count_other({ count: drafts }) : m.programs_drafts_count_one({ count: drafts })),
    review > 0 &&
      (review > 1
        ? m.programs_absences_review_other({ count: review })
        : m.programs_absences_review_one({ count: review })),
  ].filter(Boolean)

  return (
    <div className="flex max-w-6xl flex-col gap-4">
      <PageHeader
        title={m.programs_page_title()}
        titleBadge={
          programmes.length > 0 ? (
            <span className="text-base text-faint tabular-nums">{facts.join(' · ')}</span>
          ) : undefined
        }
        breadcrumbs={[{ label: m.sidebar_programs() }]}
        actions={
          canCreate && (
            <Button asChild size="sm">
              <Link to="/programs/new">
                <Plus aria-hidden="true" />
                {m.programs_new_button()}
              </Link>
            </Button>
          )
        }
        controls={hasAnyProgramme ? <PeriodMenu period={period} preset={preset} today={today} /> : undefined}
      />
      <ProgrammeList
        programmes={programmes}
        period={period}
        preset={preset}
        hasAnyProgramme={hasAnyProgramme}
        canCreate={canCreate}
        timeZone={timeZone}
        now={new Date(now)}
      />
    </div>
  )
}
