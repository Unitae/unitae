import { useState } from 'react'
import { data, redirect, useFetcher } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { getEventProgramme } from '~/features/events/server/event-part-assignments.server'
import { getTemplates } from '~/features/events/server/event-templates.server'
import { canEditEvent } from '~/features/events/server/events-auth.server'
import { EventInfoCard } from '~/features/events/ui/EventInfoCard'
import { EventPartsCard, type PartAssignment, reorderPartIds } from '~/features/events/ui/EventPartsCard'
import { EventServicesCard, type ServiceRoleAssignment } from '~/features/events/ui/EventServicesCard'
import { InlineDeleteDialog } from '~/features/events/ui/InlineDeleteDialog'
import { PartEditSheet } from '~/features/events/ui/PartEditSheet'
import { ServiceEditSheet } from '~/features/events/ui/ServiceEditSheet'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { listRoles } from '~/shared/domain/roles.server'
import type { Permission } from '~/shared/types/permission'
import { PageHeader } from '~/shared/ui/PageHeader'
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

    const [templates, allRoles] = await Promise.all([getTemplates(db, congregationId), listRoles(db, congregationId)])

    const partAllowed = await db.eventPartAllowedRole.findMany({
      where: { assignmentId: { in: event.eventParts.map(p => p.id) }, congregationId },
      select: { assignmentId: true, roleId: true, asKind: true },
    })
    const serviceAllowed = await db.eventServiceRoleAllowedRole.findMany({
      where: { assignmentId: { in: event.eventServiceRoles.map(s => s.id) }, congregationId },
      select: { assignmentId: true, roleId: true },
    })

    const partsWithRoles = event.eventParts.map(p => ({
      ...p,
      allowedSpeakerRoleIds: partAllowed
        .filter(r => r.assignmentId === p.id && r.asKind === 'speaker')
        .map(r => r.roleId),
      allowedReaderRoleIds: partAllowed
        .filter(r => r.assignmentId === p.id && r.asKind === 'reader')
        .map(r => r.roleId),
    }))
    const serviceAssignmentsWithRoles = event.eventServiceRoles.map(s => ({
      ...s,
      allowedRoleIds: serviceAllowed.filter(r => r.assignmentId === s.id).map(r => r.roleId),
    }))

    const roles = allRoles.map(r => ({ id: r.id, key: r.key, name: r.name, isBuiltIn: r.isBuiltIn }))

    const sectionSuggestions = distinct(event.eventParts.map(p => p.section))
    const trackSuggestions = distinct(event.eventParts.map(p => p.track))

    return {
      event: {
        ...event,
        eventParts: partsWithRoles,
        eventServiceRoles: serviceAssignmentsWithRoles,
      },
      templates,
      roles,
      sectionSuggestions,
      trackSuggestions,
      timezone: context.get(congregationContext).timezone,
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
    const result = await handleEditIntent(intent, formData, db, eventId, congregationId, currentUser.id, timezone)
    if (result && 'reply' in result) return data(result.reply(), { status: 400 })
    if (result?.message) session.flash('success', result.message)

    return data({ ok: true }, { headers: { 'Set-Cookie': await commitSession(session) } })
  })
}

export default function EditEventPage({ loaderData }: Route.ComponentProps) {
  const { event, templates, roles, sectionSuggestions, trackSuggestions, timezone } = loaderData

  const infoFetcher = useFetcher()
  const partFetcher = useFetcher()
  const serviceFetcher = useFetcher()
  const deleteFetcher = useFetcher()
  const reorderFetcher = useFetcher()
  const templateFetcher = useFetcher()

  const [editingPart, setEditingPart] = useState<PartAssignment | null>(null)
  const [partSheetOpen, setPartSheetOpen] = useState(false)

  const [editingService, setEditingService] = useState<ServiceRoleAssignment | null>(null)
  const [serviceSheetOpen, setServiceSheetOpen] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<{ type: 'part' | 'service'; id: number; name: string } | null>(null)

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')

  function handlePartDragEnd(e: { active: { id: number | string }; over: { id: number | string } | null }) {
    if (!e.over) return
    const ids = event.eventParts.map(p => p.id)
    const reordered = reorderPartIds(ids, Number(e.active.id), Number(e.over.id))
    if (reordered === ids) return

    reorderFetcher.submit(
      { orderedIds: reordered },
      { method: 'POST', action: `/programs/events/${event.id}/reorder-parts`, encType: 'application/json' },
    )
  }

  function handleDelete() {
    if (!deleteTarget) return
    const formData = new FormData()
    if (deleteTarget.type === 'part') {
      formData.set('intent', 'delete-part')
      formData.set('partAssignmentId', String(deleteTarget.id))
    } else {
      formData.set('intent', 'delete-service')
      formData.set('serviceAssignmentId', String(deleteTarget.id))
    }
    deleteFetcher.submit(formData, { method: 'post' })
    setDeleteTarget(null)
  }

  function handleApplyTemplate() {
    if (!selectedTemplateId) return
    const formData = new FormData()
    formData.set('intent', 'apply-template')
    formData.set('templateId', selectedTemplateId)
    templateFetcher.submit(formData, { method: 'post' })
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.programs_edit_page_title()}
        subtitle={event.name}
        breadcrumbs={[
          { label: m.sidebar_programs(), to: '/programs' },
          { label: event.name, to: `/programs/events/${event.id}` },
          { label: m.programs_edit_page_title() },
        ]}
        backTo={`/programs/events/${event.id}`}
      />

      <EventInfoCard event={event} timezone={timezone} fetcher={infoFetcher} />

      <EventPartsCard
        parts={event.eventParts}
        templates={templates}
        selectedTemplateId={selectedTemplateId}
        onTemplateChange={setSelectedTemplateId}
        onApplyTemplate={handleApplyTemplate}
        isApplyingTemplate={templateFetcher.state !== 'idle'}
        onAddPart={() => {
          setEditingPart(null)
          setPartSheetOpen(true)
        }}
        onEditPart={part => {
          setEditingPart(part)
          setPartSheetOpen(true)
        }}
        onDeletePart={target => setDeleteTarget({ type: 'part', id: target.id, name: target.name })}
        onDragEnd={handlePartDragEnd}
      />

      <EventServicesCard
        services={event.eventServiceRoles}
        onAddService={() => {
          setEditingService(null)
          setServiceSheetOpen(true)
        }}
        onEditService={service => {
          setEditingService(service)
          setServiceSheetOpen(true)
        }}
        onDeleteService={target => setDeleteTarget({ type: 'service', id: target.id, name: target.name })}
      />

      <PartEditSheet
        open={partSheetOpen}
        onOpenChange={setPartSheetOpen}
        part={editingPart}
        mode="event"
        fetcher={partFetcher}
        defaultOrder={event.eventParts.length + 1}
        roles={roles}
        sectionSuggestions={sectionSuggestions}
        trackSuggestions={trackSuggestions}
      />

      <ServiceEditSheet
        open={serviceSheetOpen}
        onOpenChange={setServiceSheetOpen}
        service={editingService}
        mode="event"
        fetcher={serviceFetcher}
        roles={roles}
      />

      <InlineDeleteDialog
        open={deleteTarget != null}
        onOpenChange={open => {
          if (!open) setDeleteTarget(null)
        }}
        itemName={deleteTarget?.name ?? ''}
        onConfirm={handleDelete}
        isDeleting={deleteFetcher.state !== 'idle'}
      />
    </div>
  )
}
