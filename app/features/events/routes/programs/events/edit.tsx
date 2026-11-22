import { data, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import {
  getPartAssignmentAllowedRoleIdsForParts,
  getServicePartAssignmentAllowedRoleIdsForParts,
} from '~/features/events/server/allowed-roles.queries'
import { getEventProgramme } from '~/features/events/server/event-part-assignments.server'
import { listApplicableTemplates, resolveEventItem } from '~/features/events/server/events-auth.server'
import { listPartPresets } from '~/features/events/server/part-presets.queries'
import { findProgrammeEvent } from '~/features/events/server/programme-event.queries'
import {
  canChangeEvent,
  canFillSchedule,
  canFillTemplateSchedules,
} from '~/features/events/server/schedule-rights.server'
import { EventEditor } from '~/features/events/ui/EventEditor'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { listRoles } from '~/shared/domain/roles.server'
import { Permission } from '~/shared/types/permission'
import { distinct } from '~/shared/utils/distinct'
import { requireParamId } from '~/shared/utils/params.server'
import { handleEditIntent, kindsFilledBy } from './_edit-event-intents.server'

import type { Route } from './+types/edit'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.programs_edit_meta_title() }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  const eventId = requireParamId(params.eventId, '/programs')

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const can = (role: Permission) => permissions.has(role)
    const event = await getEventProgramme(db, eventId, congregationId)
    if (!event) throw redirect('/programs')

    if (!(await canChangeEvent(db, can, currentUser.id, event, congregationId))) {
      throw redirect('/programs')
    }

    const [applicable, canFillParts, canFillServices, allRoles, partRoles, serviceRoles, presets] = await Promise.all([
      listApplicableTemplates(db, can, currentUser.id, congregationId),
      // Each schedule's section is editable by whoever may fill it (plan §10, D31): the action refuses the others.
      canFillSchedule(db, can, currentUser.id, event, 'part', congregationId),
      canFillSchedule(db, can, currentUser.id, event, 'service', congregationId),
      listRoles(db, congregationId),
      getPartAssignmentAllowedRoleIdsForParts(
        db,
        event.eventParts.map(part => part.id),
        congregationId,
      ),
      getServicePartAssignmentAllowedRoleIdsForParts(
        db,
        event.eventServiceParts.map(service => service.id),
        congregationId,
      ),
      listPartPresets(db, congregationId),
    ])

    // Only the templates whose every schedule the caller may fill: applying one fills them (mayApplyTemplate).
    const mayFillAll = await Promise.all(
      applicable.map(template => canFillTemplateSchedules(db, can, currentUser.id, template.id, congregationId)),
    )
    const templates = applicable.filter((_, index) => mayFillAll[index])

    const partsWithRoles = event.eventParts.map(part => ({
      ...part,
      allowedSpeakerRoleIds: partRoles.get(part.id)?.speaker ?? [],
      allowedReaderRoleIds: partRoles.get(part.id)?.reader ?? [],
    }))
    const serviceAssignmentsWithRoles = event.eventServiceParts.map(service => ({
      ...service,
      allowedRoleIds: serviceRoles.get(service.id) ?? [],
    }))

    const roles = allRoles.map(r => ({ id: r.id, key: r.key, name: r.name, isBuiltIn: r.isBuiltIn }))
    const sectionSuggestions = distinct(event.eventParts.map(p => p.section))
    const trackSuggestions = distinct(event.eventParts.map(p => p.track))

    return {
      event: {
        ...event,
        eventParts: partsWithRoles,
        eventServiceParts: serviceAssignmentsWithRoles,
      },
      templates,
      roles,
      presets,
      sectionSuggestions,
      trackSuggestions,
      timezone: context.get(congregationContext).timezone,
      canFillParts,
      canFillServices,
      // A template responsible may edit an event without being allowed to read the programmes.
      canViewPrograms: permissions.has(Permission.CanViewPrograms),
    }
  })
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const session = await getSession(request.headers.get('Cookie'))
  const eventId = requireParamId(params.eventId, '/programs')
  const formData = await request.formData()
  const intent = formData.get('intent')

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const can = (role: Permission) => permissions.has(role)
    const event = await findProgrammeEvent(db, eventId, congregationId)
    if (!event) throw redirect('/programs')

    if (!(await canChangeEvent(db, can, currentUser.id, event, congregationId))) {
      throw redirect('/programs')
    }
    // On top of the event right above, an intent that writes items must also be allowed to fill their schedule (plan
    // §10, D31: a programme responsible no longer fills the duties of a template that names another).
    for (const kind of kindsFilledBy(intent)) {
      if (!(await canFillSchedule(db, can, currentUser.id, event, kind, congregationId))) throw redirect('/programs')
    }

    const timezone = context.get(congregationContext).timezone
    const result = await handleEditIntent(intent, formData, db, eventId, congregationId, currentUser.id, timezone, {
      // Moving the event to a kind is changing it as an event of that kind (D49), and fills what that kind brings.
      mayApplyTemplate: async templateId =>
        (await canChangeEvent(db, can, currentUser.id, { id: event.id, templateId }, congregationId)) &&
        (await canFillTemplateSchedules(db, can, currentUser.id, templateId, congregationId)),
      itemInEvent: (kind, { itemId, legacyId }) =>
        resolveEventItem(db, { itemId: itemId ?? null, legacyId: legacyId ?? null }, kind, eventId, congregationId),
    })
    if (result && 'reply' in result) return data(result.reply(), { status: 400 })
    if (result?.message) session.flash('success', result.message)

    return data({ ok: true }, { headers: { 'Set-Cookie': await commitSession(session) } })
  })
}

export default function EditEventPage({ loaderData }: Route.ComponentProps) {
  return <EventEditor {...loaderData} />
}
