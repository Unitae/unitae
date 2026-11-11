import { redirect } from 'react-router'
import { resolveProgrammeLink } from '~/features/display-board/index.server'
import { mayOpenEvent } from '~/features/events/model/programme-access'
import { ResponsibilityScope } from '~/features/events/model/responsibility-scope.type'
import { buildAssignmentCandidates } from '~/features/events/server/assignment-candidates.server'
import { buildShareTextsForEvent } from '~/features/events/server/build-share-message.server'
import { getEventProgramme } from '~/features/events/server/event-part-assignments.server'
import { canEditEvent } from '~/features/events/server/events-auth.server'
import { listExternalSpeakerOptions } from '~/features/events/server/external-speakers.queries'
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

    // Each action on the page follows the right its route checks: editing and deleting the event, publishing it,
    // assigning the parts, and assigning the services — the narrower delegation a service responsible holds.
    const check = (required: Permission, scope?: ResponsibilityScope) =>
      canEditEvent(db, can, currentUser.id, event.templateId, congregationId, required, scope)
    const [canEdit, canPublish, canAssign, canAssignService] = await Promise.all([
      check(Permission.CanManagePrograms),
      check(Permission.CanPublishPrograms),
      check(Permission.CanAssignProgramParts),
      check(Permission.CanAssignProgramParts, ResponsibilityScope.Service),
    ])
    const canAssignAnything = canAssign || canAssignService
    refuseDraft(event.status, { canEdit, canPublish, canAssign, canAssignService })

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
      event,
      canEdit,
      canPublish,
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
