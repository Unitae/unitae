import { normalizeSpeakerName, tidyCongregationName } from '~/features/events/model/speaker-congregation-name'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { ConflictError, NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'

// Writes to the external speakers. Reads (the directory, a speaker's sheet, the assign-panel options) live in
// external-speakers.queries.ts. An anonymised speaker (« supprimé définitivement ») is out of reach of every write.

export interface ExternalSpeakerInput {
  name: string
  /** Null for the legacy speakers with no congregation (« à compléter »). */
  speakerCongregationId: number | null
  phone: string
  phone2: string
  email: string
  email2: string
  talks: number[]
  notes: string
}

/** Thrown when the name is another spelling of a speaker already in the same congregation. */
export class DuplicateExternalSpeakerError extends ConflictError {
  constructor(readonly existingId: number) {
    super('External speaker already exists for this congregation')
  }
}

/** Talk outline numbers as stored: positive whole numbers, each once, ascending. */
export function tidyTalks(talks: number[]): number[] {
  return [...new Set(talks.filter(talk => Number.isInteger(talk) && talk > 0))].sort((a, b) => a - b)
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/** The congregation the speaker joins, checked against the tenant; its name is mirrored onto the old text column. */
async function resolveCongregation(
  db: TransactionClient,
  congregationId: number,
  speakerCongregationId: number | null,
) {
  if (speakerCongregationId == null) return { speakerCongregationId: null, congregationName: '' }
  const target = await db.speakerCongregation.findFirst({
    where: { id: speakerCongregationId, congregationId },
    select: { id: true, name: true },
  })
  if (!target) throw new NotFoundError('SpeakerCongregation', speakerCongregationId)
  return { speakerCongregationId: target.id, congregationName: target.name }
}

async function assertNotDuplicate(
  db: TransactionClient,
  congregationId: number,
  speakerCongregationId: number | null,
  name: string,
  exceptId?: number,
) {
  const key = normalizeSpeakerName(name)
  const neighbours = await db.externalSpeaker.findMany({
    where: { congregationId, speakerCongregationId, anonymizedAt: null },
    select: { id: true, name: true },
  })
  const clash = neighbours.find(other => other.id !== exceptId && normalizeSpeakerName(other.name) === key)
  if (clash) throw new DuplicateExternalSpeakerError(clash.id)
}

function speakerFields(input: ExternalSpeakerInput) {
  return {
    name: tidyCongregationName(input.name),
    phone: blankToNull(input.phone),
    phone2: blankToNull(input.phone2),
    email: blankToNull(input.email),
    email2: blankToNull(input.email2),
    talks: tidyTalks(input.talks),
    notes: blankToNull(input.notes),
  }
}

export async function createExternalSpeaker(
  db: TransactionClient,
  congregationId: number,
  actorId: number,
  input: ExternalSpeakerInput,
) {
  const link = await resolveCongregation(db, congregationId, input.speakerCongregationId)
  const fields = speakerFields(input)
  await assertNotDuplicate(db, congregationId, link.speakerCongregationId, fields.name)

  const speaker = await db.externalSpeaker.create({ data: { ...fields, ...link, congregationId } })

  audit({
    action: AuditAction.ExternalSpeakerCreated,
    congregationId,
    actorId,
    entityType: 'ExternalSpeaker',
    entityId: speaker.id,
    metadata: { name: speaker.name, congregationName: link.congregationName },
  })
  return speaker
}

async function findLiveSpeaker(db: TransactionClient, id: number, congregationId: number) {
  const speaker = await db.externalSpeaker.findFirst({
    where: { id, congregationId, anonymizedAt: null },
    select: { id: true, name: true, archivedAt: true },
  })
  if (!speaker) throw new NotFoundError('ExternalSpeaker', id)
  return speaker
}

export async function updateExternalSpeaker(
  db: TransactionClient,
  id: number,
  congregationId: number,
  actorId: number,
  input: ExternalSpeakerInput,
) {
  await findLiveSpeaker(db, id, congregationId)
  const link = await resolveCongregation(db, congregationId, input.speakerCongregationId)
  const fields = speakerFields(input)
  await assertNotDuplicate(db, congregationId, link.speakerCongregationId, fields.name, id)

  const speaker = await db.externalSpeaker.update({
    where: { id_congregationId: { id, congregationId } },
    data: { ...fields, ...link },
  })

  audit({
    action: AuditAction.ExternalSpeakerUpdated,
    congregationId,
    actorId,
    entityType: 'ExternalSpeaker',
    entityId: speaker.id,
    metadata: { name: speaker.name, congregationName: link.congregationName },
  })
  return speaker
}

/** « Retirer de la liste »: no longer offered in programmes. Visits and talks already planned stay. */
export async function retireExternalSpeaker(
  db: TransactionClient,
  id: number,
  congregationId: number,
  actorId: number,
) {
  await findLiveSpeaker(db, id, congregationId)
  const speaker = await db.externalSpeaker.update({
    where: { id_congregationId: { id, congregationId } },
    data: { archivedAt: new Date() },
  })
  audit({
    action: AuditAction.ExternalSpeakerArchived,
    congregationId,
    actorId,
    entityType: 'ExternalSpeaker',
    entityId: id,
  })
  return speaker
}

/** « Remettre sur la liste ». */
export async function restoreExternalSpeaker(
  db: TransactionClient,
  id: number,
  congregationId: number,
  actorId: number,
) {
  await findLiveSpeaker(db, id, congregationId)
  const speaker = await db.externalSpeaker.update({
    where: { id_congregationId: { id, congregationId } },
    data: { archivedAt: null },
  })
  audit({
    action: AuditAction.ExternalSpeakerUnarchived,
    congregationId,
    actorId,
    entityType: 'ExternalSpeaker',
    entityId: id,
  })
  return speaker
}

/**
 * « Supprimer définitivement », for a retired speaker only. The talks still planned are freed (the part goes back to
 * « à pourvoir »); name, contact, talks and notes are erased; the row stays, so past programmes read « Orateur
 * extérieur · <congregation> » rather than an empty slot.
 */
export async function deleteExternalSpeaker(
  db: TransactionClient,
  id: number,
  congregationId: number,
  actorId: number,
) {
  const speaker = await findLiveSpeaker(db, id, congregationId)
  if (speaker.archivedAt == null) throw new ConflictError('Retire the speaker from the list before deleting it')

  const now = new Date()
  const freed = await db.eventPart.updateMany({
    where: { congregationId, externalSpeakerId: id, event: { startDate: { gte: now } } },
    data: { externalSpeakerId: null },
  })
  const pastParts = await db.eventPart.count({ where: { congregationId, externalSpeakerId: id } })

  await db.externalSpeaker.update({
    where: { id_congregationId: { id, congregationId } },
    data: {
      name: '',
      congregationName: '',
      phone: null,
      phone2: null,
      email: null,
      email2: null,
      notes: null,
      talks: [],
      anonymizedAt: now,
    },
  })

  audit({
    action: AuditAction.ExternalSpeakerDeleted,
    congregationId,
    actorId,
    entityType: 'ExternalSpeaker',
    entityId: id,
    metadata: { freedParts: freed.count, pastParts },
  })
  return { freedParts: freed.count, pastParts }
}
