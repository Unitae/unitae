import { data, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import {
  getPartAssignmentAllowedRoleIdsForParts,
  getServicePartAssignmentAllowedRoleIdsForParts,
} from '~/features/events/server/allowed-roles.queries'
import { getEventProgramme } from '~/features/events/server/event-part-assignments.server'
import { canEditEvent, listApplicableTemplates } from '~/features/events/server/events-auth.server'
import { listPartPresets } from '~/features/events/server/part-presets.queries'
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
import { handleEditIntent } from './_edit-event-intents.server'

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

    if (!(await canEditEvent(db, can, currentUser.id, event.templateId ?? null, congregationId))) {
      throw redirect('/programs')
    }

    const [templates, allRoles, partRoles, serviceRoles, presets] = await Promise.all([
      listApplicableTemplates(db, can, currentUser.id, congregationId),
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
    const event = await db.event.findFirst({ where: { id: eventId, congregationId } })
    if (!event) throw redirect('/programs')

    if (!(await canEditEvent(db, can, currentUser.id, event.templateId ?? null, congregationId))) {
      throw redirect('/programs')
    }

    const timezone = context.get(congregationContext).timezone
    const result = await handleEditIntent(intent, formData, db, eventId, congregationId, currentUser.id, timezone, {
      mayApplyTemplate: templateId => canEditEvent(db, can, currentUser.id, templateId, congregationId),
    })
    if (result && 'reply' in result) return data(result.reply(), { status: 400 })
    if (result?.message) session.flash('success', result.message)

    return data({ ok: true }, { headers: { 'Set-Cookie': await commitSession(session) } })
  })
}

export default function EditEventPage({ loaderData }: Route.ComponentProps) {
  return <EventEditor {...loaderData} />
}
