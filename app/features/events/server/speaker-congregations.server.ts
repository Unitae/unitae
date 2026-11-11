import { normalizeCongregationName, tidyCongregationName } from '~/features/events/model/speaker-congregation-name'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { ConflictError, NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'

// Writes to the congregations whose list of speakers we receive. Reads live in external-speakers.queries.ts.

export interface SpeakerCongregationInput {
  name: string
  responsibleName: string
  responsiblePhone: string
  responsibleEmail: string
  coordinatorName: string
  coordinatorPhone: string
  coordinatorEmail: string
  notes: string
}

/** Thrown when a name is another spelling of a congregation already in the list. */
export class DuplicateSpeakerCongregationError extends ConflictError {
  constructor(readonly existingName: string) {
    super('A speaker congregation with this name already exists')
  }
}

function contactFields(input: SpeakerCongregationInput) {
  return {
    responsibleName: input.responsibleName.trim(),
    responsiblePhone: input.responsiblePhone.trim(),
    responsibleEmail: input.responsibleEmail.trim(),
    coordinatorName: input.coordinatorName.trim(),
    coordinatorPhone: input.coordinatorPhone.trim(),
    coordinatorEmail: input.coordinatorEmail.trim(),
    notes: input.notes.trim(),
  }
}

async function assertNameFree(
  db: TransactionClient,
  congregationId: number,
  nameNormalized: string,
  exceptId?: number,
) {
  const clash = await db.speakerCongregation.findFirst({
    where: { congregationId, nameNormalized, ...(exceptId == null ? {} : { id: { not: exceptId } }) },
    select: { id: true, name: true },
  })
  if (clash) throw new DuplicateSpeakerCongregationError(clash.name)
}

export async function createSpeakerCongregation(
  db: TransactionClient,
  congregationId: number,
  actorId: number,
  input: SpeakerCongregationInput,
) {
  const name = tidyCongregationName(input.name)
  const nameNormalized = normalizeCongregationName(name)
  await assertNameFree(db, congregationId, nameNormalized)

  const created = await db.speakerCongregation.create({
    data: { name, nameNormalized, ...contactFields(input), congregationId },
  })

  audit({
    action: AuditAction.SpeakerCongregationCreated,
    congregationId,
    actorId,
    entityType: 'SpeakerCongregation',
    entityId: created.id,
    metadata: { name },
  })
  return created
}

export async function updateSpeakerCongregation(
  db: TransactionClient,
  id: number,
  congregationId: number,
  actorId: number,
  input: SpeakerCongregationInput,
) {
  const existing = await db.speakerCongregation.findFirst({ where: { id, congregationId }, select: { name: true } })
  if (!existing) throw new NotFoundError('SpeakerCongregation', id)

  const name = tidyCongregationName(input.name)
  const nameNormalized = normalizeCongregationName(name)
  await assertNameFree(db, congregationId, nameNormalized, id)

  const updated = await db.speakerCongregation.update({
    where: { id_congregationId: { id, congregationId } },
    data: { name, nameNormalized, ...contactFields(input) },
  })
  if (name !== existing.name) {
    // A server still running the previous version reads the free-text column; keep it in step for one release.
    await db.externalSpeaker.updateMany({
      where: { congregationId, speakerCongregationId: id, anonymizedAt: null },
      data: { congregationName: name },
    })
  }

  audit({
    action: AuditAction.SpeakerCongregationUpdated,
    congregationId,
    actorId,
    entityType: 'SpeakerCongregation',
    entityId: id,
    metadata: { name, ...(name === existing.name ? {} : { previousName: existing.name }) },
  })
  return updated
}

/**
 * Deletes a congregation once nobody is left in it, retired speakers included (anonymised ones do not count: they
 * hold no personal data). Returns the key of its kept list PDF, which the caller removes from storage after commit.
 */
export async function deleteSpeakerCongregation(
  db: TransactionClient,
  id: number,
  congregationId: number,
  actorId: number,
) {
  const existing = await db.speakerCongregation.findFirst({
    where: { id, congregationId },
    select: { name: true, listFileKey: true },
  })
  if (!existing) throw new NotFoundError('SpeakerCongregation', id)

  const speakers = await db.externalSpeaker.count({
    where: { congregationId, speakerCongregationId: id, anonymizedAt: null },
  })
  if (speakers > 0) throw new ConflictError('Speaker congregation still has speakers')

  await db.speakerCongregation.delete({ where: { id_congregationId: { id, congregationId } } })

  audit({
    action: AuditAction.SpeakerCongregationDeleted,
    congregationId,
    actorId,
    entityType: 'SpeakerCongregation',
    entityId: id,
    metadata: { name: existing.name },
  })
  return { listFileKey: existing.listFileKey }
}
