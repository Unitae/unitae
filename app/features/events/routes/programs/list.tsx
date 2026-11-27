import { Plus } from 'lucide-react'
import { Link, redirect, type ShouldRevalidateFunctionArgs } from 'react-router'

import { EventStatus } from '~/features/events/model/event-status.type'
import { listPeriod, selectedPreset } from '~/features/events/model/list-period'
import { mayOpenEvent } from '~/features/events/model/programme-access'
import { publishActionsFor } from '~/features/events/server/event-publishing.server'
import { congregationHasProgrammes, listProgrammes } from '~/features/events/server/programme-list.queries'
import { scheduleRightsFor } from '~/features/events/server/schedule-rights.server'
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
  const can = (permission: Permission) => permissions.has(permission)

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const items = await listProgrammes(db, {
      congregationId,
      from: startOfDay(period.from, timezone),
      to: endOfDay(period.to, timezone),
    })
    // Each programme by its schedules' rules, as its own page and routes decide (plan §10); `kindIds`, the kinds whose
    // events the reader may change, also says who may create (D28) and stands for "may act on some draft".
    const { rightsOf, kindIds } = await scheduleRightsFor(db, can, currentUser.id, items, congregationId)
    // « Tout publier » / « Tout retirer » by the reader's schedules (D43, D52); a bare event by its own rule (D46).
    const actionsOf = await publishActionsFor(
      db,
      can,
      currentUser.id,
      items,
      congregationId,
      id => rightsOf.get(id)?.canPublish === true,
    )

    // Only what the page shows: no template ids, drafts only for whoever may act on them (the event page's own rule),
    // and the assignments to review only for whoever may reassign them, until the programme is held.
    const programmes = items.flatMap(item => {
      const rights = rightsOf.get(item.id)
      if (rights == null) throw new Error(`No rights for programme ${item.id}`)
      const opens = mayOpenEvent(item.status, {
        canEdit: rights.canEdit,
        canPublish: rights.canPublish,
        canAssign: rights.canAssignParts,
        // Some duties schedule of it is theirs: a meeting may hold several, each its own responsible's.
        canAssignService: rights.opensForDuties,
      })
      if (!opens) return []
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
          awaitingProgramme: item.awaitingProgramme,
          review,
          canEdit: rights.canEdit,
          canDelete: rights.canDelete,
          canRelease: actionsOf.get(item.id)?.canRelease === true,
          canUnrelease: actionsOf.get(item.id)?.canUnrelease === true,
        },
      ]
    })

    // Rows the reader may act on are never hidden behind « no programme yet ».
    const hasAnyProgramme =
      programmes.length > 0 ||
      (await congregationHasProgrammes(db, congregationId, {
        withDrafts: canManage || canPublish || canAssign || kindIds.length > 0,
      }))

    return {
      programmes,
      period,
      preset: selectedPreset(period, today),
      today,
      now,
      hasAnyProgramme,
      canCreate: canManage || kindIds.length > 0,
      timeZone: timezone,
    }
  })
}

// The filters narrow the loaded list in the page: only a new period, or a bulk action, reads the database again.
export function shouldRevalidate({
  currentUrl,
  nextUrl,
  formMethod,
  formAction,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  // Asking bulk « Publier » what it will do writes nothing: the list stays as it is.
  if (formAction === '/programs/bulk-release-preview') return false
  if (formMethod != null || currentUrl.pathname !== nextUrl.pathname) return defaultShouldRevalidate
  const periodOf = (url: URL) => PERIOD_PARAMS.map(name => url.searchParams.get(name)).join('|')
  return periodOf(currentUrl) !== periodOf(nextUrl)
}

export default function ProgramListPage({ loaderData }: Route.ComponentProps) {
  const { programmes, period, preset, today, now, hasAnyProgramme, canCreate, timeZone } = loaderData
  // A meeting waiting for its programme is neither a programme nor a draft yet: it is counted on its own.
  const awaiting = programmes.filter(row => row.awaitingProgramme).length
  const drafts = programmes.filter(row => row.status === EventStatus.Draft && !row.awaitingProgramme).length
  const review = programmes.reduce((total, row) => total + row.review, 0)
  const facts = [
    programmes.length > awaiting && m.programs_count({ count: programmes.length - awaiting }),
    drafts > 0 && m.programs_drafts_count({ count: drafts }),
    awaiting > 0 && m.programs_awaiting_count({ count: awaiting }),
    review > 0 && m.programs_absences_review({ count: review }),
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
