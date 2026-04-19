import { Form, redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { getEventProgramme } from '~/features/events/server/programme-assignments.server'
import { canEditEvent } from '~/features/events/server/programme-auth.server'
import {
  addPartAssignment,
  addServiceRoleAssignment,
  applyTemplateToEvent,
  deletePartAssignment,
  deleteServiceRoleAssignment,
  updateEvent,
} from '~/features/events/server/programme-events.server'
import { getTemplates } from '~/features/events/server/programme-templates.server'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { type TransactionClient, withScope } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

import type { Route } from './+types/edit'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.programs_edit_meta_title() }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { currentUser, can, congregationId } = await authenticateAndAuthorize(request, [Role.ProgramManager])

  const eventId = requireParamId(params.eventId, '/congregation/programs')

  return withScope(congregationId, async db => {
    const event = await getEventProgramme(db, eventId, congregationId)
    if (!event) throw redirect('/congregation/programs')

    if (!(await canEditEvent(db, can, currentUser.id, event.templateId ?? null, congregationId))) {
      throw redirect('/congregation/programs')
    }

    const templates = await getTemplates(db, congregationId)
    return { event, templates }
  })
}

export async function action({ request, params }: Route.ActionArgs) {
  const { currentUser, can, session, congregationId } = await authenticateAndAuthorize(request, [Role.ProgramManager])
  const eventId = requireParamId(params.eventId, '/congregation/programs')
  const form = await request.formData()
  const intent = form.get('intent')

  return withScope(congregationId, async db => {
    const event = await db.event.findFirst({ where: { id: eventId, congregationId } })
    if (!event) throw redirect('/congregation/programs')

    if (!(await canEditEvent(db, can, currentUser.id, event.templateId ?? null, congregationId))) {
      throw redirect('/congregation/programs')
    }

    const message = await handleEditIntent(intent, form, db, eventId, congregationId, currentUser.id)
    if (message) session.flash('success', message)

    return redirect(`/congregation/programs/events/${eventId}`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}

function handleEditIntent(
  intent: FormDataEntryValue | null,
  form: FormData,
  db: TransactionClient,
  eventId: number,
  congregationId: number,
  userId: number,
): Promise<string | null> {
  switch (intent) {
    case 'update-event':
      return handleUpdateEvent(form, db, eventId, congregationId)
    case 'add-part':
      return handleAddPart(form, db, eventId, congregationId)
    case 'delete-part':
      return handleDeletePart(form, db, congregationId)
    case 'add-service':
      return handleAddService(form, db, eventId, congregationId)
    case 'delete-service':
      return handleDeleteService(form, db, congregationId)
    case 'apply-template':
      return handleApplyTemplate(form, db, eventId, congregationId, userId)
    default:
      return Promise.resolve(null)
  }
}

async function handleUpdateEvent(form: FormData, db: TransactionClient, eventId: number, congregationId: number) {
  const name = String(form.get('name') ?? '').trim()
  if (!name) return null

  const dateStr = String(form.get('date') ?? '')
  const startTimeStr = String(form.get('startTime') ?? '')
  const endTimeStr = String(form.get('endTime') ?? '')

  const data: Record<string, unknown> = { name }

  if (dateStr && startTimeStr) {
    const startDate = new Date(`${dateStr}T${startTimeStr}`)
    if (!Number.isNaN(startDate.getTime())) data.startDate = startDate
  }
  if (dateStr && endTimeStr) {
    const endDate = new Date(`${dateStr}T${endTimeStr}`)
    if (!Number.isNaN(endDate.getTime())) data.endDate = endDate
  }

  await updateEvent(db, eventId, congregationId, data)
  return m.programs_edit_event_updated()
}

async function handleAddPart(form: FormData, db: TransactionClient, eventId: number, congregationId: number) {
  const partName = String(form.get('partName') ?? '').trim()
  if (!partName) return null
  await addPartAssignment(db, {
    eventId,
    name: partName,
    section: String(form.get('partSection') ?? ''),
    track: String(form.get('partTrack') ?? ''),
    order: Number(form.get('partOrder') ?? 0),
    durationMin: form.get('partDuration') ? Number(form.get('partDuration')) : null,
    congregationId,
  })
  return m.programs_edit_part_added()
}

async function handleDeletePart(form: FormData, db: TransactionClient, congregationId: number) {
  await deletePartAssignment(db, Number(form.get('partAssignmentId')), congregationId)
  return m.programs_edit_part_deleted()
}

async function handleAddService(form: FormData, db: TransactionClient, eventId: number, congregationId: number) {
  const serviceName = String(form.get('serviceName') ?? '').trim()
  if (!serviceName) return null
  await addServiceRoleAssignment(db, { eventId, name: serviceName, congregationId })
  return m.programs_edit_service_added()
}

async function handleDeleteService(form: FormData, db: TransactionClient, congregationId: number) {
  await deleteServiceRoleAssignment(db, Number(form.get('serviceAssignmentId')), congregationId)
  return m.programs_edit_service_deleted()
}

async function handleApplyTemplate(
  form: FormData,
  db: TransactionClient,
  eventId: number,
  congregationId: number,
  userId: number,
): Promise<string | null> {
  const templateId = Number(form.get('templateId'))
  const template = await applyTemplateToEvent(db, eventId, templateId, congregationId, userId)
  if (!template) return null
  return m.programs_edit_template_applied({ name: template.name })
}

export default function EditEventPage({ loaderData }: Route.ComponentProps) {
  const { event, templates } = loaderData
  const hasParts = event.partAssignments.length > 0 || event.serviceRoleAssignments.length > 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={m.programs_edit_page_title()} subtitle={event.name} />

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="text-base">{m.programs_edit_info_title()}</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="post" className="flex flex-col gap-4">
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
                defaultValue={new Date(event.startDate).toISOString().split('T')[0]}
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
                  defaultValue={new Date(event.startDate).toTimeString().slice(0, 5)}
                  required
                />
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="endTime">{m.programs_edit_end_time_label()}</Label>
                <Input
                  id="endTime"
                  name="endTime"
                  type="time"
                  defaultValue={new Date(event.endDate).toTimeString().slice(0, 5)}
                  required
                />
              </div>
            </div>
            <Button type="submit" className="w-fit">
              {m.common_save()}
            </Button>
          </Form>
        </CardContent>
      </Card>

      {!hasParts && (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle className="text-base">{m.programs_edit_apply_template_title()}</CardTitle>
          </CardHeader>
          <CardContent>
            <Form method="post" className="flex flex-col gap-4">
              <input type="hidden" name="intent" value="apply-template" />
              <p className="text-muted-foreground text-sm">{m.programs_edit_apply_template_hint()}</p>
              <div className="flex flex-col gap-2">
                <Label htmlFor="templateId">{m.programs_edit_template_label()}</Label>
                <Select name="templateId">
                  <SelectTrigger>
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
              </div>
              <Button type="submit" className="w-fit">
                {m.programs_edit_apply_button()}
              </Button>
            </Form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{m.programs_edit_spiritual_program()}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {event.partAssignments.map(assignment => (
            <div key={assignment.id} className="flex items-center justify-between border-b pb-2">
              <div className="flex flex-col">
                <span className="font-medium text-sm">{assignment.name}</span>
                {assignment.section && <span className="text-muted-foreground text-xs">{assignment.section}</span>}
                {assignment.durationMin && (
                  <span className="text-muted-foreground text-xs">{assignment.durationMin} min</span>
                )}
              </div>
              <Form method="post">
                <input type="hidden" name="intent" value="delete-part" />
                <input type="hidden" name="partAssignmentId" value={assignment.id} />
                <Button type="submit" variant="destructive" size="sm">
                  {m.common_delete()}
                </Button>
              </Form>
            </div>
          ))}

          <Form method="post" className="flex flex-wrap items-end gap-2 border-t pt-3">
            <input type="hidden" name="intent" value="add-part" />
            <div className="flex flex-col gap-1">
              <Label className="text-xs">{m.programs_edit_part_name_label()}</Label>
              <Input name="partName" placeholder={m.programs_edit_new_part_placeholder()} className="w-40" required />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">{m.programs_edit_part_section_label()}</Label>
              <Input name="partSection" className="w-40" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">{m.programs_edit_part_track_label()}</Label>
              <Input name="partTrack" className="w-40" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">{m.programs_edit_part_order_label()}</Label>
              <Input
                name="partOrder"
                type="number"
                defaultValue={event.partAssignments.length + 1}
                className="w-16"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">{m.programs_edit_part_duration_label()}</Label>
              <Input name="partDuration" type="number" className="w-20" />
            </div>
            <Button type="submit" size="sm">
              {m.programs_edit_add_button()}
            </Button>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{m.programs_edit_services_title()}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {event.serviceRoleAssignments.map(assignment => (
            <div key={assignment.id} className="flex items-center justify-between border-b pb-2">
              <span className="font-medium text-sm">{assignment.name}</span>
              <Form method="post">
                <input type="hidden" name="intent" value="delete-service" />
                <input type="hidden" name="serviceAssignmentId" value={assignment.id} />
                <Button type="submit" variant="destructive" size="sm">
                  {m.common_delete()}
                </Button>
              </Form>
            </div>
          ))}

          <Form method="post" className="flex items-end gap-2 border-t pt-3">
            <input type="hidden" name="intent" value="add-service" />
            <div className="flex flex-col gap-1">
              <Label className="text-xs">{m.programs_edit_part_name_label()}</Label>
              <Input
                name="serviceName"
                placeholder={m.programs_edit_new_service_placeholder()}
                className="w-48"
                required
              />
            </div>
            <Button type="submit" size="sm">
              {m.programs_edit_add_button()}
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
