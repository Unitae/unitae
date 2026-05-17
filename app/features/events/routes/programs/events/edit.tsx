import { parseWithZod } from '@conform-to/zod'
import { closestCenter, DndContext, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Clock, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { data, redirect, useFetcher } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import {
  addPartSchema,
  addServiceSchema,
  applyTemplateSchema,
  deletePartSchema,
  deleteServiceSchema,
  updateEventSchema,
  updatePartSchema,
  updateServiceSchema,
} from '~/features/events/schemas/program-edit.schema'
import { getEventProgramme } from '~/features/events/server/programme-assignments.server'
import { canEditEvent } from '~/features/events/server/programme-auth.server'
import {
  addPartAssignment,
  addServiceRoleAssignment,
  applyTemplateToEvent,
  deletePartAssignment,
  deleteServiceRoleAssignment,
  updateEvent,
  updatePartAssignment,
  updateServiceRoleAssignment,
} from '~/features/events/server/programme-events.server'
import { getTemplates } from '~/features/events/server/programme-templates.server'
import { InlineDeleteDialog } from '~/features/events/ui/InlineDeleteDialog'
import { PartEditSheet } from '~/features/events/ui/PartEditSheet'
import { ServiceEditSheet } from '~/features/events/ui/ServiceEditSheet'
import { SortableRow } from '~/features/events/ui/SortableRow'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { listRoles } from '~/shared/domain/roles.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { Permission } from '~/shared/types/permission'
import { combineLocalDateTime, formatDateForInput, formatTimeForInput } from '~/shared/utils/event-time'
import { Button } from '~/shared/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'
import { requireParamId } from '~/shared/utils/params.server'

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

    const [templates, eventKinds, allRoles] = await Promise.all([
      getTemplates(db, congregationId),
      db.eventKind.findMany({
        where: { congregationId, NOT: { key: 'off' } },
        orderBy: { name: 'asc' },
      }),
      listRoles(db, congregationId),
    ])

    const partAllowed = await db.programmePartAssignmentAllowedRole.findMany({
      where: { assignmentId: { in: event.partAssignments.map(p => p.id) }, congregationId },
      select: { assignmentId: true, roleId: true, asKind: true },
    })
    const serviceAllowed = await db.programmeServiceRoleAssignmentAllowedRole.findMany({
      where: { assignmentId: { in: event.serviceRoleAssignments.map(s => s.id) }, congregationId },
      select: { assignmentId: true, roleId: true },
    })

    const partAssignmentsWithRoles = event.partAssignments.map(p => ({
      ...p,
      allowedSpeakerRoleIds: partAllowed
        .filter(r => r.assignmentId === p.id && r.asKind === 'speaker')
        .map(r => r.roleId),
      allowedReaderRoleIds: partAllowed
        .filter(r => r.assignmentId === p.id && r.asKind === 'reader')
        .map(r => r.roleId),
    }))
    const serviceAssignmentsWithRoles = event.serviceRoleAssignments.map(s => ({
      ...s,
      allowedRoleIds: serviceAllowed.filter(r => r.assignmentId === s.id).map(r => r.roleId),
    }))

    const roles = allRoles.map(r => ({ id: r.id, key: r.key, name: r.name, isBuiltIn: r.isBuiltIn }))

    return {
      event: {
        ...event,
        partAssignments: partAssignmentsWithRoles,
        serviceRoleAssignments: serviceAssignmentsWithRoles,
      },
      templates,
      eventKinds,
      roles,
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

type IntentResult = { message: string | null } | { reply: () => unknown }

function handleEditIntent(
  intent: FormDataEntryValue | null,
  formData: FormData,
  db: TransactionClient,
  eventId: number,
  congregationId: number,
  userId: number,
  timezone: string,
): Promise<IntentResult | null> {
  const handlers: Partial<Record<string, () => Promise<IntentResult | null>>> = {
    'update-event': () => handleUpdateEvent(formData, db, eventId, congregationId, timezone),
    'add-part': () => handleAddPart(formData, db, eventId, congregationId, userId),
    'update-part': () => handleUpdatePart(formData, db, congregationId, userId),
    'delete-part': () => handleDeletePart(formData, db, congregationId),
    'add-service': () => handleAddService(formData, db, eventId, congregationId, userId),
    'update-service': () => handleUpdateService(formData, db, congregationId, userId),
    'delete-service': () => handleDeleteService(formData, db, congregationId),
    'apply-template': () => handleApplyTemplate(formData, db, eventId, congregationId, userId),
  }
  return handlers[String(intent)]?.() ?? Promise.resolve(null)
}

async function handleUpdateEvent(
  formData: FormData,
  db: TransactionClient,
  eventId: number,
  congregationId: number,
  timezone: string,
): Promise<IntentResult> {
  const submission = parseWithZod(formData, { schema: updateEventSchema })
  if (submission.status !== 'success') return submission

  const { name, date: dateStr, startTime: startTimeStr, endTime: endTimeStr, kindId } = submission.value
  const payload: Record<string, unknown> = { name, kindId }

  if (dateStr && startTimeStr) {
    const startDate = combineLocalDateTime(dateStr, startTimeStr, timezone)
    if (!Number.isNaN(startDate.getTime())) payload.startDate = startDate
  }
  if (dateStr && endTimeStr) {
    const endDate = combineLocalDateTime(dateStr, endTimeStr, timezone)
    if (!Number.isNaN(endDate.getTime())) payload.endDate = endDate
  }

  await updateEvent(db, eventId, congregationId, payload)
  return { message: m.programs_edit_event_updated() }
}

async function handleAddPart(
  formData: FormData,
  db: TransactionClient,
  eventId: number,
  congregationId: number,
  actorId: number,
): Promise<IntentResult> {
  const submission = parseWithZod(formData, { schema: addPartSchema })
  if (submission.status !== 'success') return submission

  const {
    partName,
    partSection,
    partTrack,
    partTrackOrder,
    partOrder,
    partDuration,
    partAllowExternalSpeaker,
    allowedSpeakerRoleIds,
    allowedReaderRoleIds,
  } = submission.value
  await addPartAssignment(
    db,
    {
      eventId,
      name: partName,
      section: partSection,
      track: partTrack,
      trackOrder: partTrackOrder ?? null,
      order: partOrder,
      durationMin: partDuration ?? null,
      allowExternalSpeaker: partAllowExternalSpeaker,
      allowedSpeakerRoleIds,
      allowedReaderRoleIds,
      congregationId,
    },
    actorId,
  )
  return { message: m.programs_edit_part_added() }
}

async function handleUpdatePart(
  formData: FormData,
  db: TransactionClient,
  congregationId: number,
  actorId: number,
): Promise<IntentResult> {
  const submission = parseWithZod(formData, { schema: updatePartSchema })
  if (submission.status !== 'success') return submission

  const {
    partAssignmentId,
    partName,
    partSection,
    partTrack,
    partTrackOrder,
    partOrder,
    partDuration,
    partAllowExternalSpeaker,
    allowedSpeakerRoleIds,
    allowedReaderRoleIds,
  } = submission.value
  await updatePartAssignment(
    db,
    partAssignmentId,
    {
      name: partName,
      section: partSection,
      track: partTrack,
      trackOrder: partTrackOrder ?? null,
      order: partOrder,
      durationMin: partDuration ?? null,
      allowExternalSpeaker: partAllowExternalSpeaker,
      allowedSpeakerRoleIds,
      allowedReaderRoleIds,
    },
    congregationId,
    actorId,
  )
  return { message: m.programs_edit_event_updated() }
}

async function handleUpdateService(
  formData: FormData,
  db: TransactionClient,
  congregationId: number,
  actorId: number,
): Promise<IntentResult> {
  const submission = parseWithZod(formData, { schema: updateServiceSchema })
  if (submission.status !== 'success') return submission

  await updateServiceRoleAssignment(
    db,
    submission.value.serviceAssignmentId,
    { name: submission.value.serviceName, allowedRoleIds: submission.value.allowedRoleIds },
    congregationId,
    actorId,
  )
  return { message: m.programs_edit_event_updated() }
}

async function handleDeletePart(
  formData: FormData,
  db: TransactionClient,
  congregationId: number,
): Promise<IntentResult> {
  const submission = parseWithZod(formData, { schema: deletePartSchema })
  if (submission.status !== 'success') return submission

  await deletePartAssignment(db, submission.value.partAssignmentId, congregationId)
  return { message: m.programs_edit_part_deleted() }
}

async function handleAddService(
  formData: FormData,
  db: TransactionClient,
  eventId: number,
  congregationId: number,
  actorId: number,
): Promise<IntentResult> {
  const submission = parseWithZod(formData, { schema: addServiceSchema })
  if (submission.status !== 'success') return submission

  await addServiceRoleAssignment(
    db,
    {
      eventId,
      name: submission.value.serviceName,
      allowedRoleIds: submission.value.allowedRoleIds,
      congregationId,
    },
    actorId,
  )
  return { message: m.programs_edit_service_added() }
}

async function handleDeleteService(
  formData: FormData,
  db: TransactionClient,
  congregationId: number,
): Promise<IntentResult> {
  const submission = parseWithZod(formData, { schema: deleteServiceSchema })
  if (submission.status !== 'success') return submission

  await deleteServiceRoleAssignment(db, submission.value.serviceAssignmentId, congregationId)
  return { message: m.programs_edit_service_deleted() }
}

async function handleApplyTemplate(
  formData: FormData,
  db: TransactionClient,
  eventId: number,
  congregationId: number,
  userId: number,
): Promise<IntentResult> {
  const submission = parseWithZod(formData, { schema: applyTemplateSchema })
  if (submission.status !== 'success') return submission

  const template = await applyTemplateToEvent(db, eventId, submission.value.templateId, congregationId, userId)
  if (!template) return { message: null }
  return { message: m.programs_edit_template_applied({ name: template.name }) }
}

export default function EditEventPage({ loaderData }: Route.ComponentProps) {
  const { event, templates, eventKinds, roles, timezone } = loaderData

  const infoFetcher = useFetcher()
  const partFetcher = useFetcher()
  const serviceFetcher = useFetcher()
  const deleteFetcher = useFetcher()
  const reorderFetcher = useFetcher()
  const templateFetcher = useFetcher()

  const [editingPart, setEditingPart] = useState<{
    id: number
    name: string
    section: string
    track: string
    trackOrder: number | null
    order: number
    durationMin: number | null
    allowExternalSpeaker: boolean
    allowedSpeakerRoleIds: number[]
    allowedReaderRoleIds: number[]
  } | null>(null)
  const [partSheetOpen, setPartSheetOpen] = useState(false)

  const [editingService, setEditingService] = useState<{ id: number; name: string; allowedRoleIds: number[] } | null>(
    null,
  )
  const [serviceSheetOpen, setServiceSheetOpen] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<{ type: 'part' | 'service'; id: number; name: string } | null>(null)

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')

  function handlePartDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return

    const ids = event.partAssignments.map(p => p.id)
    const oldIndex = ids.indexOf(Number(active.id))
    const newIndex = ids.indexOf(Number(over.id))
    const reordered = [...ids]
    const [moved] = reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, moved)

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

  // Group parts by section for visual grouping
  const partsBySection: { section: string; parts: typeof event.partAssignments }[] = []
  let currentSection: string | null = null
  for (const part of event.partAssignments) {
    const section = part.section || ''
    if (section !== currentSection) {
      partsBySection.push({ section, parts: [] })
      currentSection = section
    }
    partsBySection.at(-1)?.parts.push(part)
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

      {/* General info */}
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="text-base">{m.programs_edit_info_title()}</CardTitle>
        </CardHeader>
        <CardContent>
          <infoFetcher.Form method="post" className="flex flex-col gap-4">
            <input type="hidden" name="intent" value="update-event" />
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">{m.common_name()}</Label>
              <Input id="name" name="name" defaultValue={event.name} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="date">{m.programs_edit_date_label()}</Label>
              <Input
                id="date"
                name="date"
                type="date"
                defaultValue={formatDateForInput(event.startDate, timezone)}
                required
              />
            </div>
            <div className="flex gap-4">
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="startTime">{m.programs_edit_start_time_label()}</Label>
                <Input
                  id="startTime"
                  name="startTime"
                  type="time"
                  defaultValue={formatTimeForInput(event.startDate, timezone)}
                  required
                />
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="endTime">{m.programs_edit_end_time_label()}</Label>
                <Input
                  id="endTime"
                  name="endTime"
                  type="time"
                  defaultValue={formatTimeForInput(event.endDate, timezone)}
                  required
                />
              </div>
            </div>
            {eventKinds.length > 0 && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="kindId">{m.programs_new_kind_label()}</Label>
                <Select name="kindId" defaultValue={event.kindId?.toString() ?? 'none'}>
                  <SelectTrigger id="kindId">
                    <SelectValue placeholder={m.programs_new_kind_placeholder()} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{m.programs_edit_kind_none()}</SelectItem>
                    {eventKinds.map(kind => (
                      <SelectItem key={kind.id} value={kind.id.toString()}>
                        {kind.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <SubmitButton className="w-fit">{m.common_save()}</SubmitButton>
          </infoFetcher.Form>
        </CardContent>
      </Card>

      {/* Spiritual program */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{m.programs_edit_spiritual_program()}</CardTitle>
          <CardAction>
            <div className="flex items-center gap-2">
              {templates.length > 0 && (
                <div className="flex items-center gap-1">
                  <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                    <SelectTrigger className="h-8 w-40 text-xs">
                      <SelectValue placeholder={m.programs_edit_select_template()} />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map(template => (
                        <SelectItem key={template.id} value={template.id.toString()}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleApplyTemplate}
                    disabled={!selectedTemplateId || templateFetcher.state !== 'idle'}
                  >
                    {m.programs_edit_apply_button()}
                  </Button>
                </div>
              )}
              <Button
                size="sm"
                onClick={() => {
                  setEditingPart(null)
                  setPartSheetOpen(true)
                }}
              >
                <Plus className="size-4" />
                {m.programs_edit_add_part_button()}
              </Button>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent>
          {event.partAssignments.length > 0 ? (
            <DndContext collisionDetection={closestCenter} onDragEnd={handlePartDragEnd}>
              <SortableContext items={event.partAssignments.map(p => p.id)} strategy={verticalListSortingStrategy}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead>{m.programs_view_part_col()}</TableHead>
                      <TableHead className="w-24">{m.programs_view_duration_col()}</TableHead>
                      <TableHead className="w-20">{m.common_actions()}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {partsBySection.map(group => (
                      <>
                        {group.section && (
                          <TableRow key={`section-${group.section}`} className="bg-muted/50">
                            <TableCell colSpan={4} className="py-1.5">
                              <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                                {group.section}
                              </span>
                            </TableCell>
                          </TableRow>
                        )}
                        {group.parts.map(assignment => (
                          <SortableRow key={assignment.id} id={assignment.id}>
                            <TableCell>
                              <span className="font-medium text-sm">{assignment.name}</span>
                            </TableCell>
                            <TableCell>
                              {assignment.durationMin ? (
                                <span className="flex items-center gap-1 text-muted-foreground text-sm">
                                  <Clock className="size-3" />
                                  {assignment.durationMin} min
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-sm">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7"
                                  onClick={() => {
                                    setEditingPart({
                                      id: assignment.id,
                                      name: assignment.name,
                                      section: assignment.section,
                                      track: assignment.track,
                                      trackOrder: assignment.trackOrder,
                                      order: assignment.order,
                                      durationMin: assignment.durationMin,
                                      allowExternalSpeaker: assignment.allowExternalSpeaker,
                                      allowedSpeakerRoleIds: assignment.allowedSpeakerRoleIds,
                                      allowedReaderRoleIds: assignment.allowedReaderRoleIds,
                                    })
                                    setPartSheetOpen(true)
                                  }}
                                >
                                  <Pencil className="size-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-destructive hover:text-destructive"
                                  onClick={() =>
                                    setDeleteTarget({ type: 'part', id: assignment.id, name: assignment.name })
                                  }
                                >
                                  <Trash2 className="size-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </SortableRow>
                        ))}
                      </>
                    ))}
                  </TableBody>
                </Table>
              </SortableContext>
            </DndContext>
          ) : (
            <p className="text-muted-foreground text-sm">{m.programs_edit_apply_template_hint()}</p>
          )}
        </CardContent>
      </Card>

      {/* Services */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{m.programs_edit_services_title()}</CardTitle>
          <CardAction>
            <Button
              size="sm"
              onClick={() => {
                setEditingService(null)
                setServiceSheetOpen(true)
              }}
            >
              <Plus className="size-4" />
              {m.programs_edit_add_service_button()}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {event.serviceRoleAssignments.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.programs_view_role_col()}</TableHead>
                  <TableHead className="w-20">{m.common_actions()}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {event.serviceRoleAssignments.map(assignment => (
                  <TableRow key={assignment.id}>
                    <TableCell className="font-medium text-sm">{assignment.name}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => {
                            setEditingService({
                              id: assignment.id,
                              name: assignment.name,
                              allowedRoleIds: assignment.allowedRoleIds,
                            })
                            setServiceSheetOpen(true)
                          }}
                        >
                          <Pencil className="size-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget({ type: 'service', id: assignment.id, name: assignment.name })}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-sm italic">{m.programs_edit_new_service_placeholder()}</p>
          )}
        </CardContent>
      </Card>

      {/* Sheets */}
      <PartEditSheet
        open={partSheetOpen}
        onOpenChange={setPartSheetOpen}
        part={editingPart}
        mode="event"
        fetcher={partFetcher}
        defaultOrder={event.partAssignments.length + 1}
        roles={roles}
      />

      <ServiceEditSheet
        open={serviceSheetOpen}
        onOpenChange={setServiceSheetOpen}
        service={editingService}
        mode="event"
        fetcher={serviceFetcher}
        roles={roles}
      />

      {/* Delete confirmation */}
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
