import {
  setTemplatePartAllowedRoles,
  setTemplateServicePartAllowedRoles,
} from '~/features/events/server/allowed-roles.server'
import { syncTemplateScheduleTemplates } from '~/features/events/server/schedule-templates.server'
import { setTemplatePartRooms } from '~/features/events/server/template-rooms.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { ConflictError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { sanitizeText } from '~/shared/utils/sanitize-text'

// A template's items: its parts and its services, with who may take each.

export async function upsertTemplatePart(
  db: TransactionClient,
  templateId: number,
  partData: {
    id?: number
    name: string
    section: string
    track: string
    trackOrder?: number | null
    order: number
    durationMin: number | null
    allowExternalSpeaker: boolean
    speakerLabel?: string | null
    readerLabel?: string | null
    // The kind this part defaults to. Null where the template genuinely cannot
    // know — the ministry parts change kind weekly and are set per event.
    presetId?: number | null
    // Optional on purpose: undefined means the caller does not manage the
    // slot, [] means it does and the selection is empty.
    allowedSpeakerRoleIds?: number[]
    allowedReaderRoleIds?: number[]
    // The rooms it is held in, from « Où » (the main room always among them); undefined leaves its rooms as they are.
    roomIds?: readonly number[]
  },
  congregationId: number,
  actorId: number,
) {
  const baseData = {
    name: sanitizeText(partData.name),
    section: sanitizeText(partData.section),
    track: sanitizeText(partData.track),
    trackOrder: partData.trackOrder,
    order: partData.order,
    durationMin: partData.durationMin,
    allowExternalSpeaker: partData.allowExternalSpeaker,
    speakerLabel: partData.speakerLabel,
    readerLabel: partData.readerLabel,
    presetId: partData.presetId ?? null,
  }

  const part = partData.id
    ? await db.templatePart.update({
        where: { id_congregationId: { id: partData.id, congregationId } },
        data: baseData,
      })
    : await db.templatePart.create({
        data: { ...baseData, templateId, congregationId },
      })
  await syncTemplateScheduleTemplates(db, templateId, congregationId)
  if (partData.roomIds !== undefined) await holdInRooms(db, part.id, partData.roomIds, congregationId, actorId)

  const noChange = { added: [] as number[], removed: [] as number[] }
  const speakerDiff = partData.allowedSpeakerRoleIds
    ? await setTemplatePartAllowedRoles(db, part.id, 'speaker', partData.allowedSpeakerRoleIds, congregationId)
    : noChange
  const readerDiff = partData.allowedReaderRoleIds
    ? await setTemplatePartAllowedRoles(db, part.id, 'reader', partData.allowedReaderRoleIds, congregationId)
    : noChange

  if (
    speakerDiff.added.length > 0 ||
    speakerDiff.removed.length > 0 ||
    readerDiff.added.length > 0 ||
    readerDiff.removed.length > 0
  ) {
    audit({
      action: AuditAction.PartAllowedRolesChanged,
      congregationId,
      actorId,
      entityType: 'TemplatePart',
      entityId: part.id,
      metadata: { speaker: speakerDiff, reader: readerDiff },
    })
  }

  return part
}

export function deleteTemplatePart(db: TransactionClient, partId: number, congregationId: number) {
  return db.templatePart.delete({
    where: {
      id_congregationId: { id: partId, congregationId },
    },
  })
}

/** After the template's services: a new one goes last. */
async function nextTemplateServiceOrder(db: TransactionClient, templateId: number, congregationId: number) {
  const last = await db.templateServicePart.aggregate({ where: { templateId, congregationId }, _max: { order: true } })
  return last._max.order == null ? 0 : last._max.order + 5
}

export async function upsertTemplateServicePart(
  db: TransactionClient,
  templateId: number,
  roleData: { id?: number; name: string; key: string; allowedRoleIds: number[] },
  congregationId: number,
  actorId: number,
) {
  const servicePart = roleData.id
    ? await db.templateServicePart.update({
        where: { id_congregationId: { id: roleData.id, congregationId } },
        data: { name: roleData.name, key: roleData.key },
      })
    : await db.templateServicePart.create({
        data: {
          name: roleData.name,
          key: roleData.key,
          order: await nextTemplateServiceOrder(db, templateId, congregationId),
          templateId,
          congregationId,
        },
      })
  await syncTemplateScheduleTemplates(db, templateId, congregationId)

  const diff = await setTemplateServicePartAllowedRoles(db, servicePart.id, roleData.allowedRoleIds, congregationId)

  if (diff.added.length > 0 || diff.removed.length > 0) {
    audit({
      action: AuditAction.ServicePartAllowedRolesChanged,
      congregationId,
      actorId,
      entityType: 'TemplateServicePart',
      entityId: servicePart.id,
      metadata: { added: diff.added, removed: diff.removed },
    })
  }

  return servicePart
}

export function deleteTemplateServicePart(db: TransactionClient, roleId: number, congregationId: number) {
  return db.templateServicePart.delete({
    where: {
      id_congregationId: { id: roleId, congregationId },
    },
  })
}

/**
 * Puts a template's parts in the given order. Writes nothing and answers false when an id is not a part of this
 * template: the caller was authorised on this template, not on whichever template a posted id belongs to.
 */
export async function reorderTemplateParts(
  db: TransactionClient,
  congregationId: number,
  templateId: number,
  orderedIds: number[],
): Promise<boolean> {
  await db.$executeRawUnsafe('SELECT pg_advisory_xact_lock($1, $2)', 1_000_005, congregationId)
  const owned = await db.templatePart.count({ where: { id: { in: orderedIds }, templateId, congregationId } })
  if (owned !== orderedIds.length || new Set(orderedIds).size !== orderedIds.length) return false

  for (let i = 0; i < orderedIds.length; i++) {
    await db.templatePart.update({
      where: {
        id_congregationId: { id: orderedIds[i], congregationId },
      },
      data: { order: i * 5 },
    })
  }
  return true
}

/** Holds a part in its rooms, in the schedule template it was just placed in; its caller checked the rooms first. */
async function holdInRooms(
  db: TransactionClient,
  partId: number,
  roomIds: readonly number[],
  congregationId: number,
  actorId: number,
) {
  const placed = await db.templatePart.findFirst({
    where: { id: partId, congregationId },
    select: { scheduleTemplateId: true },
  })
  if (placed?.scheduleTemplateId == null) throw new ConflictError('The part is in no schedule template')
  const outcome = await setTemplatePartRooms(db, placed.scheduleTemplateId, partId, roomIds, congregationId, actorId)
  if (outcome !== 'saved') throw new ConflictError(`The part's rooms were refused: ${outcome}`)
}
