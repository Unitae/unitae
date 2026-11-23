import { redirect } from 'react-router'
import { resolveProgrammeLink } from '~/features/display-board/index.server'
import { isAwaitingProgramme, programmeTemplate } from '~/features/events/model/empty-meetings'
import { mayOpenEvent, maySeeSchedule } from '~/features/events/model/programme-access'
import { ScheduleKind } from '~/features/events/model/schedule.type'
import { buildAssignmentCandidates } from '~/features/events/server/assignment-candidates.server'
import { eventHasAttendance } from '~/features/events/server/attendance.queries'
import { buildShareTextsForEvent } from '~/features/events/server/build-share-message.server'
import { getEventProgramme } from '~/features/events/server/event-part-assignments.server'
import { publishActionsFor, publishableScheduleIds } from '~/features/events/server/event-publishing.server'
import { listExternalSpeakerOptions } from '~/features/events/server/external-speakers.queries'
import { listScheduleResponsibles } from '~/features/events/server/schedule-responsibles.queries'
import {
  canChangeEvent,
  canDeleteEvent,
  canFillSchedule,
  canPublishEvent,
} from '~/features/events/server/schedule-rights.server'
import { EventView } from '~/features/events/ui/EventView'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'
import type { Route } from './+types/view'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.programs_view_meta_title() }]
}

/** A draft is work in progress: only someone who may act on it opens it, as on the programmes list. */
function refuseDraft(status: string, rights: Parameters<typeof mayOpenEvent>[1]) {
  if (!mayOpenEvent(status, rights)) throw redirect('/programs')
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  requirePermission(permissions, Permission.CanViewPrograms)

  const eventId = requireParamId(params.eventId, '/programs')

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const can = (role: Permission) => permissions.has(role)
    const event = await getEventProgramme(db, eventId, congregationId)
    if (!event) throw redirect('/programs')

    // Each action on the page follows the rule its route checks (plan §10): changing the event, deleting it, giving
    // an empty meeting its programme, publishing it, and filling each schedule.
    const fill = (kind: 'part' | 'service') => canFillSchedule(db, can, currentUser.id, event, kind, congregationId)
    const [canEdit, canDelete, canPublish, canAssign, canAssignService] = await Promise.all([
      canChangeEvent(db, can, currentUser.id, event, congregationId),
      canDeleteEvent(db, can, currentUser.id, event, congregationId),
      canPublishEvent(db, can, currentUser.id, event, congregationId),
      fill('part'),
      fill('service'),
    ])
    // As create-programme: an empty meeting of a kind takes its programme from whoever may change it (D28).
    const canCreateProgramme = canEdit && event.templateId != null
    const canAssignAnything = canAssign || canAssignService
    const rights = { canEdit, canPublish, canAssign, canAssignService }
    // « Tout publier » / « Tout retirer » by the reader's own schedules (D43, D52); a bare event by canPublishEvent (D46).
    const actions = (await publishActionsFor(db, can, currentUser.id, [event], congregationId, () => canPublish)).get(
      event.id,
    ) ?? { canRelease: false, canUnrelease: false }
    refuseDraft(event.status, rights)
    // A draft schedule reaches only whoever may act on it (spec §5.3, D45): the others' items never leave the server.
    // By kind, while an event holds one schedule of each (see maySeeSchedule).
    const hidden = new Set(event.schedules.filter(schedule => !maySeeSchedule(schedule, rights)).map(s => s.kind))
    // Not even that a hidden schedule exists: its status leaves with neither its items nor the list of schedules.
    const shown = {
      ...event,
      schedules: event.schedules.filter(schedule => !hidden.has(schedule.kind)),
      eventParts: hidden.has(ScheduleKind.Programme) ? [] : event.eventParts,
      eventServiceParts: hidden.has(ScheduleKind.Duty) ? [] : event.eventServiceParts,
    }

    // Each schedule the reader sees, as its section shows it: its responsible (D37) and whether they may publish it.
    const mine = await publishableScheduleIds(db, can, currentUser.id, [event.id], congregationId)
    const roleOf = (schedule: (typeof shown.schedules)[number]) => schedule.scheduleTemplate?.responsibleRoleId ?? null
    const responsibles = await listScheduleResponsibles(
      db,
      shown.schedules.flatMap(schedule => roleOf(schedule) ?? []),
      congregationId,
    )
    const schedules = shown.schedules.map(schedule => ({
      id: schedule.id,
      kind: schedule.kind,
      status: schedule.status,
      name: schedule.name,
      key: schedule.key,
      responsible: responsibles.get(roleOf(schedule) ?? 0) ?? null,
      mayPublish: mine.has(schedule.id),
    }))
    const myDrafts = schedules.filter(schedule => schedule.mayPublish && schedule.status === 'draft').length

    // The delete dialog says what deleting does: with counts, only the programme goes.
    const hasAttendance = canDelete && (await eventHasAttendance(db, eventId, congregationId))

    const users = canAssignAnything
      ? await db.member.findMany({
          where: { congregationId, leftAt: null },
          orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
        })
      : []

    // Least recently here first: the order a planner rotates through.
    const externalSpeakers = canAssign ? await listExternalSpeakerOptions(db, congregationId) : []

    const candidates = canAssignAnything
      ? await buildAssignmentCandidates(db, event, users, congregationId)
      : { partCandidates: {}, serviceCandidates: {} }
    // Eligibility lists are per-slot data; hand back only the family the caller
    // may actually fill.
    const partCandidates = canAssign ? candidates.partCandidates : {}
    const serviceCandidates = canAssignService ? candidates.serviceCandidates : {}

    // Built here rather than on click: navigator.share needs the user's
    // activation, and awaiting anything before it spends that activation.
    const congregation = context.get(congregationContext)
    const shareTexts = canAssign
      ? await buildShareTextsForEvent(event, congregation, target => resolveProgrammeLink(db, target, congregationId))
      : {}

    logger.info(`Loading event programme. User ID: ${currentUser.id}. Event ID: ${eventId}.`)

    return {
      event: { ...shown, schedules },
      // « Tout publier » (D43): the drafts the reader may publish, all of them for « Publier ».
      publishAll: { count: myDrafts, everyone: can(Permission.CanPublishPrograms) },
      viewer: { accountId: currentUser.id, memberId: currentUser.memberId },
      // Created ahead and still empty: the page offers « Créer le programme » instead of publishing it.
      // From what this reader sees: a programme hidden from them is, for them, still to come.
      awaitingProgramme: isAwaitingProgramme({
        parts: shown.eventParts.length,
        services: shown.eventServiceParts.length,
        template: programmeTemplate(event.template),
      }),
      hasAttendance,
      canEdit,
      canDelete,
      canCreateProgramme,
      canRelease: actions.canRelease,
      canUnrelease: actions.canUnrelease,
      canAssign,
      canAssignService,
      canViewPublishers: can(Permission.CanViewPublishers),
      users: users.map(({ id, firstname, lastname }) => ({ id, firstname, lastname })),
      externalSpeakers,
      partCandidates,
      serviceCandidates,
      shareTexts,
      timezone: congregation.timezone,
    }
  })
}

export default function EventViewPage({ loaderData }: Route.ComponentProps) {
  return <EventView {...loaderData} />
}
