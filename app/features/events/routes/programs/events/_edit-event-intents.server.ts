import { parseWithZod } from '@conform-to/zod/v4'
import { partAllowedRolesToWrite } from '~/features/events/model/allowed-roles-write'
import {
  addPartSchema,
  addServiceSchema,
  deletePartSchema,
  deleteServiceSchema,
  updateEventSchema,
  updatePartSchema,
  updateServiceSchema,
} from '~/features/events/schemas/program-edit.schema'
import {
  addPartAssignment,
  addServicePartAssignment,
  deletePartAssignment,
  deleteServicePartAssignment,
  type UpdateEventFields,
  updateEvent,
  updatePartAssignment,
  updateServicePartAssignment,
} from '~/features/events/server/event-parts.server'
import type { ItemKind } from '~/features/events/server/item-projection.server'
import { canFillSchedule } from '~/features/events/server/schedule-rights.server'
import * as m from '~/i18n/paraglide/messages'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { Permission } from '~/shared/types/permission'
import { combineLocalDateTime } from '~/shared/utils/event-time'

export type IntentResult = { message: string | null } | { reply: () => unknown }

type EditIntent =
  | 'update-event'
  | 'add-part'
  | 'update-part'
  | 'delete-part'
  | 'add-service'
  | 'update-service'
  | 'delete-service'

/**
 * The schedule each intent fills, whose right the route checks on top of the event's (plan §10, D31). Complete over
 * the intents, so a new one does not compile until someone decides it; changing the event itself fills none. Moving
 * the event to another kind is « Changer le type » on the event page (D40), never an intent of the editor.
 */
const FILL_INTENT_KINDS: Readonly<Record<EditIntent, readonly ItemKind[]>> = {
  'update-event': [],
  'add-part': ['part'],
  'update-part': ['part'],
  'delete-part': ['part'],
  'add-service': ['service'],
  'update-service': ['service'],
  'delete-service': ['service'],
}

const isEditIntent = (intent: string): intent is EditIntent => Object.hasOwn(FILL_INTENT_KINDS, intent)

/** The schedules an intent fills on the event, none for an intent it does not know. */
export function kindsFilledBy(intent: FormDataEntryValue | null): readonly ItemKind[] {
  const name = String(intent)
  return isEditIntent(name) ? FILL_INTENT_KINDS[name] : []
}

/**
 * The duties schedule a service intent names, whose responsible alone the route then asks for: the one a service is
 * added to, or the one the service updated or deleted is in. Null when it names none, or an item of another event: the
 * route then asks for every duties schedule, and the intent refuses the item.
 */
export async function serviceScheduleNamed(
  db: TransactionClient,
  intent: FormDataEntryValue | null,
  formData: FormData,
  checks: IntentChecks,
  congregationId: number,
): Promise<number | null> {
  if (intent === 'add-service') {
    const posted = Number(formData.get('scheduleId'))
    return Number.isInteger(posted) && posted > 0 ? posted : null
  }
  if (intent !== 'update-service' && intent !== 'delete-service') return null
  const field = (name: string) => {
    const value = formData.get(name)
    return typeof value === 'string' && value !== '' ? value : undefined
  }
  const itemId = await checks.itemInEvent('service', {
    itemId: field('serviceItemId'),
    legacyId: field('serviceAssignmentId'),
  })
  if (itemId == null) return null
  const item = await db.item.findFirst({ where: { id: itemId, congregationId }, select: { scheduleId: true } })
  return item?.scheduleId ?? null
}

/**
 * Whether the caller may fill every schedule the intent writes (plan §10, D31), on top of the event right the route
 * checked: a service intent names its duties schedule (a meeting may hold several), whose responsible alone is asked.
 */
export async function fillsWhatIntentWrites(
  db: TransactionClient,
  can: (permission: Permission) => boolean,
  asked: { userId: number; congregationId: number },
  event: { id: number; templateId: number | null },
  posted: { intent: FormDataEntryValue | null; formData: FormData },
  checks: IntentChecks,
): Promise<boolean> {
  const { userId, congregationId } = asked
  const named = await serviceScheduleNamed(db, posted.intent, posted.formData, checks, congregationId)
  for (const kind of kindsFilledBy(posted.intent)) {
    const scheduleId = kind === 'service' ? named : null
    if (!(await canFillSchedule(db, can, userId, event, kind, congregationId, scheduleId))) return false
  }
  return true
}

/** The decisions that depend on who is asking, made by the route. */
export interface IntentChecks {
  /**
   * The item a form names (its id, or the old row's from a form of the previous image), when it belongs to the event
   * the caller was authorised on; null otherwise. The writers find it by its id alone, so an id from another event of
   * the congregation would otherwise ride on this event's check.
   */
  itemInEvent: (kind: ItemKind, posted: { itemId?: string; legacyId?: string }) => Promise<number | null>
}

/** The reply refusing a part or service of another event. */
function notInEvent(submission: { reply: (options: { formErrors: string[] }) => unknown }): IntentResult {
  return { reply: () => submission.reply({ formErrors: [m.programs_edit_not_in_event()] }) }
}

export function handleEditIntent(
  intent: FormDataEntryValue | null,
  formData: FormData,
  db: TransactionClient,
  eventId: number,
  congregationId: number,
  userId: number,
  timezone: string,
  checks: IntentChecks,
): Promise<IntentResult | null> {
  const handlers: Record<EditIntent, () => Promise<IntentResult | null>> = {
    'update-event': () => handleUpdateEvent(formData, db, eventId, congregationId, userId, timezone),
    'add-part': () => handleAddPart(formData, db, eventId, congregationId, userId),
    'update-part': () => handleUpdatePart(formData, db, congregationId, userId, checks),
    'delete-part': () => handleDeletePart(formData, db, congregationId, checks),
    'add-service': () => handleAddService(formData, db, eventId, congregationId, userId),
    'update-service': () => handleUpdateService(formData, db, congregationId, userId, checks),
    'delete-service': () => handleDeleteService(formData, db, congregationId, checks),
  }
  const name = String(intent)
  return isEditIntent(name) ? handlers[name]() : Promise.resolve(null)
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
    partPresetId,
    allowedSpeakerRoleIds,
    allowedReaderRoleIds,
    managedRoleSlots,
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
      presetId: partPresetId,
      ...partAllowedRolesToWrite({ managedSlots: managedRoleSlots, allowedSpeakerRoleIds, allowedReaderRoleIds }),
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
  checks: IntentChecks,
): Promise<IntentResult> {
  const submission = parseWithZod(formData, { schema: updatePartSchema })
  if (submission.status !== 'success') return submission
  const partAssignmentId = await checks.itemInEvent('part', {
    itemId: submission.value.partItemId,
    legacyId: submission.value.partAssignmentId,
  })
  if (partAssignmentId == null) return notInEvent(submission)

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
    partPresetId,
    allowedSpeakerRoleIds,
    allowedReaderRoleIds,
    managedRoleSlots,
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
      presetId: partPresetId,
      ...partAllowedRolesToWrite({ managedSlots: managedRoleSlots, allowedSpeakerRoleIds, allowedReaderRoleIds }),
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
  checks: IntentChecks,
): Promise<IntentResult> {
  const submission = parseWithZod(formData, { schema: deletePartSchema })
  if (submission.status !== 'success') return submission
  const partAssignmentId = await checks.itemInEvent('part', {
    itemId: submission.value.partItemId,
    legacyId: submission.value.partAssignmentId,
  })
  if (partAssignmentId == null) return notInEvent(submission)

  await deletePartAssignment(db, partAssignmentId, congregationId)
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

  await addServicePartAssignment(
    db,
    {
      eventId,
      name: submission.value.serviceName,
      allowedRoleIds: submission.value.allowedRoleIds,
      congregationId,
      scheduleId: submission.value.scheduleId ?? null,
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
  checks: IntentChecks,
): Promise<IntentResult> {
  const submission = parseWithZod(formData, { schema: updateServiceSchema })
  if (submission.status !== 'success') return submission
  const serviceAssignmentId = await checks.itemInEvent('service', {
    itemId: submission.value.serviceItemId,
    legacyId: submission.value.serviceAssignmentId,
  })
  if (serviceAssignmentId == null) return notInEvent(submission)

  await updateServicePartAssignment(
    db,
    serviceAssignmentId,
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
  checks: IntentChecks,
): Promise<IntentResult> {
  const submission = parseWithZod(formData, { schema: deleteServiceSchema })
  if (submission.status !== 'success') return submission
  const serviceAssignmentId = await checks.itemInEvent('service', {
    itemId: submission.value.serviceItemId,
    legacyId: submission.value.serviceAssignmentId,
  })
  if (serviceAssignmentId == null) return notInEvent(submission)

  await deleteServicePartAssignment(db, serviceAssignmentId, congregationId)
  return { message: m.programs_edit_service_deleted() }
}
