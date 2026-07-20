import { parseWithZod } from '@conform-to/zod'
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
import {
  addPartAssignment,
  addServiceRoleAssignment,
  applyTemplateToEvent,
  deletePartAssignment,
  deleteServiceRoleAssignment,
  type UpdateEventFields,
  updateEvent,
  updatePartAssignment,
  updateServiceRoleAssignment,
} from '~/features/events/server/event-parts.server'
import * as m from '~/i18n/paraglide/messages'
import type { TransactionClient } from '~/shared/infra/db.server'
import { combineLocalDateTime } from '~/shared/utils/event-time'

export type IntentResult = { message: string | null } | { reply: () => unknown }

export function handleEditIntent(
  intent: FormDataEntryValue | null,
  formData: FormData,
  db: TransactionClient,
  eventId: number,
  congregationId: number,
  userId: number,
  timezone: string,
): Promise<IntentResult | null> {
  const handlers: Partial<Record<string, () => Promise<IntentResult | null>>> = {
    'update-event': () => handleUpdateEvent(formData, db, eventId, congregationId, userId, timezone),
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
  actorId: number,
  timezone: string,
): Promise<IntentResult> {
  const submission = parseWithZod(formData, { schema: updateEventSchema })
  if (submission.status !== 'success') return submission

  const { name, date: dateStr, startTime: startTimeStr, endTime: endTimeStr } = submission.value
  const payload: UpdateEventFields = { name }

  if (dateStr && startTimeStr) {
    const startDate = combineLocalDateTime(dateStr, startTimeStr, timezone)
    if (!Number.isNaN(startDate.getTime())) payload.startDate = startDate
  }
  if (dateStr && endTimeStr) {
    const endDate = combineLocalDateTime(dateStr, endTimeStr, timezone)
    if (!Number.isNaN(endDate.getTime())) payload.endDate = endDate
  }

  await updateEvent(db, eventId, congregationId, payload, actorId)
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
    partSpeakerLabel,
    partReaderLabel,
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
      speakerLabel: partSpeakerLabel ?? null,
      readerLabel: partReaderLabel ?? null,
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
    partSpeakerLabel,
    partReaderLabel,
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
      speakerLabel: partSpeakerLabel ?? null,
      readerLabel: partReaderLabel ?? null,
      allowedSpeakerRoleIds,
      allowedReaderRoleIds,
    },
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
