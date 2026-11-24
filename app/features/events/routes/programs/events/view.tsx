import { redirect } from 'react-router'
import { resolveProgrammeLink } from '~/features/display-board/index.server'
import { isAwaitingProgramme, programmeAwaits, programmeTemplate } from '~/features/events/model/empty-meetings'
import { mayOpenEvent, maySeeSchedule } from '~/features/events/model/programme-access'
import { ScheduleKind, ScheduleStatus } from '~/features/events/model/schedule.type'
import { responsibleForPage } from '~/features/events/model/schedule-responsible'
import { buildAssignmentCandidates } from '~/features/events/server/assignment-candidates.server'
import { eventHasAttendance } from '~/features/events/server/attendance.queries'
import { buildShareTextsForEvent } from '~/features/events/server/build-share-message.server'
import { kindChangeOptions } from '~/features/events/server/event-kind-change.server'
import { getEventProgramme } from '~/features/events/server/event-part-assignments.server'
import { publishActionsFor, publishableScheduleIds } from '~/features/events/server/event-publishing.server'
import { listExternalSpeakerOptions } from '~/features/events/server/external-speakers.queries'
import { scheduleAddOptions } from '~/features/events/server/schedule-add.server'
import { changeableScheduleIds } from '~/features/events/server/schedule-changes.server'
import { listScheduleResponsibles } from '~/features/events/server/schedule-responsibles.queries'
import {
  canChangeEvent,
  canDeleteEvent,
  canFillSchedule,
  canPublishEvent,
} from '~/features/events/server/schedule-rights.server'
import { EventView } from '~/features/events/ui/EventView'
import * as m from '~/i18n/paraglide/messages'
import { resolveEffectiveRoleIds } from '~/shared/auth/permissions.server'
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
    // « Publier » / « Retirer » for an event holding no schedule, by canPublishEvent (D46); one holding schedules offers
    // each section's and « Tout publier » (publishAll, below).
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
    const [mine, viewerRoleIds, changeable, addOptions] = await Promise.all([
      publishableScheduleIds(db, can, currentUser.id, [event.id], congregationId),
      resolveEffectiveRoleIds(db, currentUser.id, congregationId),
      changeableScheduleIds(
        db,
        can,
        currentUser.id,
        shown.schedules.map(schedule => schedule.id),
        congregationId,
      ),
      scheduleAddOptions(db, can, currentUser.id, event.id, congregationId),
    ])
    const viewer = { accountId: currentUser.id, memberId: currentUser.memberId, roleIds: viewerRoleIds }
    const roleOf = (schedule: (typeof shown.schedules)[number]) => schedule.scheduleTemplate?.responsibleRoleId ?? null
    const responsibles = await listScheduleResponsibles(
      db,
      shown.schedules.flatMap(schedule => roleOf(schedule) ?? []),
      congregationId,
    )
    // From what this reader sees: a programme hidden from them is, for them, still to come.
    const awaitingProgramme = isAwaitingProgramme({
      parts: shown.eventParts.length,
      services: shown.eventServiceParts.length,
      template: programmeTemplate(event.template),
    })
    // Publishing goes by the meeting itself, not by what this reader sees of it: a duties responsible who cannot see the
    // draft programme still publishes their duties beside it.
    const awaitsInFact = isAwaitingProgramme({
      parts: event.eventParts.length,
      services: event.eventServiceParts.length,
      template: programmeTemplate(event.template),
    })
    const schedules = shown.schedules.map(schedule => {
      const roleId = roleOf(schedule)
      const responsible = roleId == null ? undefined : responsibles.get(roleId)
      const mayPublish = mine.has(schedule.id)
      // By kind, while an event holds one schedule of each (see maySeeSchedule): its items are its kind's.
      const items = schedule.kind === ScheduleKind.Programme ? shown.eventParts.length : shown.eventServiceParts.length
      return {
        id: schedule.id,
        kind: schedule.kind,
        status: schedule.status,
        name: schedule.name,
        responsible: roleId == null || responsible == null ? null : responsibleForPage(roleId, responsible, viewer),
        mayPublish,
        mayChange: changeable.has(schedule.id),
        // Never offered what publishing would refuse: an empty schedule, a programme still to give (programmeAwaits, as
        // publishSchedule). A meeting still awaiting its programme offers « Créer le programme », never publishing.
        publishable:
          !awaitsInFact &&
          mayPublish &&
          schedule.status === ScheduleStatus.Draft &&
          items > 0 &&
          !programmeAwaits(
            { kind: schedule.kind, items, fromTemplate: schedule.scheduleTemplate != null },
            event.template,
          ),
      }
    })
    const myDrafts = schedules.filter(schedule => schedule.publishable).length

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
      // « Ajouter un planning » (D39): what the reader may add of a kind the event lacks.
      addSchedule: { options: addOptions, eventKindName: event.template?.name ?? null },
      // « Changer le type » (D40): the kinds the reader may move it to, none for whoever may not change it.
      kindChange: await kindChangeOptions(db, can, currentUser.id, event.id, congregationId),
      // Created ahead and still empty: the page offers « Créer le programme » instead of publishing it.
      awaitingProgramme,
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
