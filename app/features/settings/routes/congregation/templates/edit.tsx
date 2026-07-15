import { parseWithZod } from '@conform-to/zod'
import { closestCenter, DndContext, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Clock, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { data, redirect, useFetcher } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { InlineDeleteDialog, PartEditSheet, ServiceEditSheet, SortableRow } from '~/features/events'
import {
  deleteTemplatePart,
  deleteTemplateServiceRole,
  getTemplateById,
  isTemplateResponsible,
  updateTemplate,
  upsertTemplatePart,
  upsertTemplateServiceRole,
} from '~/features/events/index.server'
import {
  deletePartSchema,
  deleteServiceRoleSchema,
  updateTemplateSchema,
  upsertPartSchema,
  upsertServiceRoleSchema,
} from '~/features/settings/schemas/template.schema'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { listRoles } from '~/shared/domain/roles.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'
import { distinct } from '~/shared/utils/distinct'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/edit'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_template_edit_meta_title() }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  const templateId = requireParamId(params.templateId, '/settings/congregation/templates')

  return withScopeFromContext(context, async db => {
    const [template, eventKinds, allRoles] = await Promise.all([
      getTemplateById(db, templateId, currentUser.congregationId),
      db.eventKind.findMany({
        where: { congregationId: currentUser.congregationId, NOT: { key: 'off' } },
        orderBy: { name: 'asc' },
      }),
      listRoles(db, currentUser.congregationId),
    ])
    if (!template) throw redirect('/settings/congregation/templates')

    const responsible = await isTemplateResponsible(db, templateId, currentUser.id, currentUser.congregationId)
    if (!permissions.has(Permission.ProgramManager) && !responsible) throw redirect('/settings/congregation/templates')

    const partAllowedRoles = await db.programmeTemplatePartAllowedRole.findMany({
      where: { partId: { in: template.parts.map(p => p.id) }, congregationId: currentUser.congregationId },
      select: { partId: true, roleId: true, asKind: true },
    })
    const serviceRoleAllowed = await db.programmeTemplateServiceRoleAllowedRole.findMany({
      where: {
        serviceRoleId: { in: template.serviceRoles.map(r => r.id) },
        congregationId: currentUser.congregationId,
      },
      select: { serviceRoleId: true, roleId: true },
    })

    const partsWithRoles = template.parts.map(p => ({
      ...p,
      allowedSpeakerRoleIds: partAllowedRoles
        .filter(r => r.partId === p.id && r.asKind === 'speaker')
        .map(r => r.roleId),
      allowedReaderRoleIds: partAllowedRoles.filter(r => r.partId === p.id && r.asKind === 'reader').map(r => r.roleId),
    }))
    const serviceRolesWithRoles = template.serviceRoles.map(r => ({
      ...r,
      allowedRoleIds: serviceRoleAllowed.filter(s => s.serviceRoleId === r.id).map(s => s.roleId),
    }))

    const roles = allRoles.map(r => ({ id: r.id, key: r.key, name: r.name, isBuiltIn: r.isBuiltIn }))

    const sectionSuggestions = distinct(template.parts.map(p => p.section))
    const trackSuggestions = distinct(template.parts.map(p => p.track))

    return {
      template: { ...template, parts: partsWithRoles, serviceRoles: serviceRolesWithRoles },
      eventKinds,
      roles,
      sectionSuggestions,
      trackSuggestions,
    }
  })
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  const templateId = requireParamId(params.templateId, '/settings/congregation/templates')
  const formData = await request.formData()
  const intent = formData.get('intent')

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: handles multiple form intents in a single transaction
  return withScopeFromContext(context, async db => {
    const responsible = await isTemplateResponsible(db, templateId, currentUser.id, currentUser.congregationId)
    if (!permissions.has(Permission.ProgramManager) && !responsible) throw redirect('/settings/congregation/templates')

    const session = await getSession(request.headers.get('Cookie'))
    if (intent === 'update-template') {
      const submission = parseWithZod(formData, { schema: updateTemplateSchema })
      if (submission.status !== 'success') return data(submission.reply(), { status: 400 })

      const { name, weekDay, kindId, startTime, endTime } = submission.value
      await updateTemplate(db, templateId, { name, weekDay, kindId, startTime, endTime }, currentUser.congregationId)
      session.flash('success', m.settings_template_edit_update_success())
      logger.info(`Updated template. User ID: ${currentUser.id}. Template ID: ${templateId}.`)
    }

    const partResult = await handlePartIntent(
      intent,
      formData,
      db,
      templateId,
      currentUser.congregationId,
      currentUser.id,
    )
    if (partResult && 'reply' in partResult) return data(partResult.reply(), { status: 400 })
    if (partResult?.message) session.flash('success', partResult.message)

    const serviceResult = await handleServiceRoleIntent(
      intent,
      formData,
      db,
      templateId,
      currentUser.congregationId,
      currentUser.id,
    )
    if (serviceResult && 'reply' in serviceResult) return data(serviceResult.reply(), { status: 400 })
    if (serviceResult?.message) session.flash('success', serviceResult.message)

    return data({ ok: true }, { headers: { 'Set-Cookie': await commitSession(session) } })
  })
}

type IntentResult = { message: string | null } | { reply: () => unknown }

async function handlePartIntent(
  intent: FormDataEntryValue | null,
  formData: FormData,
  db: TransactionClient,
  templateId: number,
  congregationId: number,
  actorId: number,
): Promise<IntentResult | null> {
  if (intent === 'upsert-part') {
    const submission = parseWithZod(formData, { schema: upsertPartSchema })
    if (submission.status !== 'success') return submission

    const {
      partId,
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
    await upsertTemplatePart(
      db,
      templateId,
      {
        id: partId,
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
    return { message: partId ? m.settings_template_edit_part_updated() : m.settings_template_edit_part_added() }
  }
  if (intent === 'delete-part') {
    const submission = parseWithZod(formData, { schema: deletePartSchema })
    if (submission.status !== 'success') return submission

    await deleteTemplatePart(db, submission.value.partId, congregationId)
    return { message: m.settings_template_edit_part_deleted() }
  }
  return null
}

async function handleServiceRoleIntent(
  intent: FormDataEntryValue | null,
  formData: FormData,
  db: TransactionClient,
  templateId: number,
  congregationId: number,
  actorId: number,
): Promise<IntentResult | null> {
  if (intent === 'upsert-service-role') {
    const submission = parseWithZod(formData, { schema: upsertServiceRoleSchema })
    if (submission.status !== 'success') return submission

    const { roleId, roleName, roleKey, allowedRoleIds } = submission.value
    const key =
      roleKey ||
      roleName
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
    await upsertTemplateServiceRole(
      db,
      templateId,
      { id: roleId, name: roleName, key, allowedRoleIds },
      congregationId,
      actorId,
    )
    return {
      message: roleId ? m.settings_template_edit_service_role_updated() : m.settings_template_edit_service_role_added(),
    }
  }
  if (intent === 'delete-service-role') {
    const submission = parseWithZod(formData, { schema: deleteServiceRoleSchema })
    if (submission.status !== 'success') return submission

    await deleteTemplateServiceRole(db, submission.value.roleId, congregationId)
    return { message: m.settings_template_edit_service_role_deleted() }
  }
  return null
}

export default function TemplateEditPage({ loaderData }: Route.ComponentProps) {
  const { template, eventKinds, roles, sectionSuggestions, trackSuggestions } = loaderData

  const infoFetcher = useFetcher()
  const partFetcher = useFetcher()
  const serviceFetcher = useFetcher()
  const deleteFetcher = useFetcher()
  const reorderFetcher = useFetcher()

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

  const [editingService, setEditingService] = useState<{
    id: number
    name: string
    allowedRoleIds: number[]
  } | null>(null)
  const [serviceSheetOpen, setServiceSheetOpen] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'part' | 'service'
    id: number
    name: string
  } | null>(null)

  function handlePartDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return

    const ids = template.parts.map(p => p.id)
    const oldIndex = ids.indexOf(Number(active.id))
    const newIndex = ids.indexOf(Number(over.id))
    const reordered = [...ids]
    const [moved] = reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, moved)

    reorderFetcher.submit(
      { orderedIds: reordered },
      {
        method: 'POST',
        action: `/settings/congregation/templates/${template.id}/reorder-parts`,
        encType: 'application/json',
      },
    )
  }

  function handleDelete() {
    if (!deleteTarget) return
    const formData = new FormData()
    if (deleteTarget.type === 'part') {
      formData.set('intent', 'delete-part')
      formData.set('partId', String(deleteTarget.id))
    } else {
      formData.set('intent', 'delete-service-role')
      formData.set('roleId', String(deleteTarget.id))
    }
    deleteFetcher.submit(formData, { method: 'post' })
    setDeleteTarget(null)
  }

  // Group parts by section
  const partsBySection: { section: string; parts: typeof template.parts }[] = []
  let currentSection: string | null = null
  for (const part of template.parts) {
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
        title={m.settings_template_edit_title({ name: template.name })}
        subtitle={m.settings_template_edit_subtitle()}
        breadcrumbs={[
          { label: m.sidebar_settings_assembly(), to: '/settings/congregation' },
          { label: 'Modèles', to: '/settings/congregation/templates' },
          { label: m.settings_template_edit_title({ name: template.name }) },
        ]}
        backTo="/settings/congregation/templates"
      />

      {/* General info */}
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="text-base">{m.settings_template_edit_general_info()}</CardTitle>
        </CardHeader>
        <CardContent>
          <infoFetcher.Form method="post" className="flex flex-col gap-4">
            <input type="hidden" name="intent" value="update-template" />
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">{m.settings_template_edit_name_label()}</Label>
              <Input id="name" name="name" defaultValue={template.name} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="weekDay">{m.settings_template_edit_weekday_label()}</Label>
              <Select name="weekDay" defaultValue={template.weekDay?.toString() ?? 'none'}>
                <SelectTrigger>
                  <SelectValue placeholder={m.settings_template_edit_weekday_none()} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{m.settings_template_edit_weekday_none()}</SelectItem>
                  <SelectItem value="0">{m.settings_template_edit_day_sunday()}</SelectItem>
                  <SelectItem value="1">{m.settings_template_edit_day_monday()}</SelectItem>
                  <SelectItem value="2">{m.settings_template_edit_day_tuesday()}</SelectItem>
                  <SelectItem value="3">{m.settings_template_edit_day_wednesday()}</SelectItem>
                  <SelectItem value="4">{m.settings_template_edit_day_thursday()}</SelectItem>
                  <SelectItem value="5">{m.settings_template_edit_day_friday()}</SelectItem>
                  <SelectItem value="6">{m.settings_template_edit_day_saturday()}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="startTime">{m.settings_template_edit_start_time_label()}</Label>
                <Input id="startTime" name="startTime" type="time" defaultValue={template.startTime} required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="endTime">{m.settings_template_edit_end_time_label()}</Label>
                <Input id="endTime" name="endTime" type="time" defaultValue={template.endTime} required />
              </div>
            </div>
            {eventKinds.length > 0 && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="kindId">{m.programs_new_kind_label()}</Label>
                <Select name="kindId" defaultValue={template.kindId?.toString() ?? 'none'}>
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

      {/* Program parts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{m.settings_template_edit_parts_title()}</CardTitle>
          <CardAction>
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
          </CardAction>
        </CardHeader>
        <CardContent>
          {template.parts.length > 0 ? (
            <DndContext collisionDetection={closestCenter} onDragEnd={handlePartDragEnd}>
              <SortableContext items={template.parts.map(p => p.id)} strategy={verticalListSortingStrategy}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>{m.settings_template_view_part_column()}</TableHead>
                      <TableHead className="w-24">{m.settings_template_view_duration_column()}</TableHead>
                      <TableHead className="w-20">{m.common_actions()}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {partsBySection.map(group => (
                      <>
                        {group.section && (
                          <TableRow key={`section-${group.section}`} className="bg-muted/50">
                            <TableCell colSpan={5} className="py-1.5">
                              <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                                {group.section}
                              </span>
                            </TableCell>
                          </TableRow>
                        )}
                        {group.parts.map(part => (
                          <SortableRow key={part.id} id={part.id}>
                            <TableCell className="text-muted-foreground">{part.order}</TableCell>
                            <TableCell>
                              <span className="font-medium text-sm">{part.name}</span>
                            </TableCell>
                            <TableCell>
                              {part.durationMin ? (
                                <span className="flex items-center gap-1 text-muted-foreground text-sm">
                                  <Clock className="size-3" />
                                  {part.durationMin} min
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
                                      id: part.id,
                                      name: part.name,
                                      section: part.section,
                                      track: part.track,
                                      trackOrder: part.trackOrder,
                                      order: part.order,
                                      durationMin: part.durationMin,
                                      allowExternalSpeaker: part.allowExternalSpeaker,
                                      allowedSpeakerRoleIds: part.allowedSpeakerRoleIds,
                                      allowedReaderRoleIds: part.allowedReaderRoleIds,
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
                                  onClick={() => setDeleteTarget({ type: 'part', id: part.id, name: part.name })}
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
            <p className="text-muted-foreground text-sm italic">{m.settings_template_edit_part_new_placeholder()}</p>
          )}
        </CardContent>
      </Card>

      {/* Service roles */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{m.settings_template_edit_service_roles_title()}</CardTitle>
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
          {template.serviceRoles.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.settings_template_edit_role_name_label()}</TableHead>
                  <TableHead className="w-20">{m.common_actions()}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {template.serviceRoles.map(role => (
                  <TableRow key={role.id}>
                    <TableCell className="font-medium text-sm">{role.name}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => {
                            setEditingService({
                              id: role.id,
                              name: role.name,
                              allowedRoleIds: role.allowedRoleIds,
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
                          onClick={() => setDeleteTarget({ type: 'service', id: role.id, name: role.name })}
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
            <p className="text-muted-foreground text-sm italic">
              {m.settings_template_edit_role_new_name_placeholder()}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Sheets */}
      <PartEditSheet
        open={partSheetOpen}
        onOpenChange={setPartSheetOpen}
        part={editingPart}
        mode="template"
        fetcher={partFetcher}
        defaultOrder={template.parts.length + 1}
        roles={roles}
        sectionSuggestions={sectionSuggestions}
        trackSuggestions={trackSuggestions}
      />

      <ServiceEditSheet
        open={serviceSheetOpen}
        onOpenChange={setServiceSheetOpen}
        service={editingService}
        mode="template"
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
