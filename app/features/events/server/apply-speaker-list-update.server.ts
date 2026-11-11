import { normalizeSpeakerName, tidyCongregationName } from '~/features/events/model/speaker-congregation-name'
import type {
  ListSpeakerFields,
  SpeakerCongregationContacts,
  SpeakerListChange,
} from '~/features/events/model/speaker-list.type'
import { DuplicateExternalSpeakerError, tidyTalks } from '~/features/events/server/external-speakers.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { ConflictError, NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export interface SpeakerListUpdate {
  speakerCongregationId: number
  /** The date written on the list received; null keeps the one recorded (a correction made by hand). */
  listDate: Date | null
  contacts: SpeakerCongregationContacts
  rows: SpeakerListChange[]
  /** The list's PDF, already in storage; it replaces the one kept so far. Null keeps the current one. */
  file: { key: string; name: string } | null
}

export interface SpeakerListUpdateResult {
  congregationName: string
  created: number
  updated: number
  moved: number
  retired: number
  /** The PDF the update replaced, for the caller to delete from storage once the transaction committed. */
  replacedFileKey: string | null
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function speakerData(fields: ListSpeakerFields) {
  return {
    name: tidyCongregationName(fields.name),
    phone: blankToNull(fields.phone),
    phone2: blankToNull(fields.phone2),
    email: blankToNull(fields.email),
    email2: blankToNull(fields.email2),
    talks: tidyTalks(fields.talks),
  }
}

function trimContacts(contacts: SpeakerCongregationContacts): SpeakerCongregationContacts {
  return {
    responsibleName: contacts.responsibleName.trim(),
    responsiblePhone: contacts.responsiblePhone.trim(),
    responsibleEmail: contacts.responsibleEmail.trim(),
    coordinatorName: contacts.coordinatorName.trim(),
    coordinatorPhone: contacts.coordinatorPhone.trim(),
    coordinatorEmail: contacts.coordinatorEmail.trim(),
  }
}

/**
 * Saves a congregation's new list in one go: new speakers, corrections (a retired speaker on the list comes back),
 * speakers moving in from another congregation, speakers absent from the list retired — never deleted, their history
 * stays — and the congregation's two contacts, list date and PDF. Every row is checked against the tenant and against
 * where the speaker really is, so a stale screen cannot move or retire the wrong person.
 */
export async function applySpeakerListUpdate(
  db: TransactionClient,
  congregationId: number,
  actorId: number,
  update: SpeakerListUpdate,
): Promise<SpeakerListUpdateResult> {
  const target = await db.speakerCongregation.findFirst({
    where: { id: update.speakerCongregationId, congregationId },
    select: { id: true, name: true, listFileKey: true },
  })
  if (!target) throw new NotFoundError('SpeakerCongregation', update.speakerCongregationId)

  const live = await db.externalSpeaker.findMany({
    where: { congregationId, anonymizedAt: null },
    select: { id: true, name: true, speakerCongregationId: true, archivedAt: true },
  })
  const byId = new Map(live.map(s => [s.id, s]))
  const isHere = (speakerId: number) => byId.get(speakerId)?.speakerCongregationId === target.id
  const isElsewhere = (speakerId: number) => byId.has(speakerId) && !isHere(speakerId)

  for (const row of update.rows) {
    if (row.kind === 'create') continue
    const valid = row.kind === 'move' ? isElsewhere(row.speakerId) : isHere(row.speakerId)
    if (!valid) throw new ConflictError(`List row does not match speaker ${row.speakerId}`)
  }
  const namesHere = new Map(
    live.filter(s => s.speakerCongregationId === target.id).map(s => [normalizeSpeakerName(s.name), s.id]),
  )
  for (const row of update.rows) {
    if (row.kind !== 'create') continue
    const existingId = namesHere.get(normalizeSpeakerName(row.fields.name))
    if (existingId != null) throw new DuplicateExternalSpeakerError(existingId)
  }

  const link = { speakerCongregationId: target.id, congregationName: target.name }
  const counts = { created: 0, updated: 0, moved: 0, retired: 0 }
  const now = new Date()
  for (const row of update.rows) {
    if (row.kind === 'create') {
      await db.externalSpeaker.create({ data: { ...speakerData(row.fields), ...link, congregationId } })
      counts.created += 1
      continue
    }
    const where = { id_congregationId: { id: row.speakerId, congregationId } }
    if (row.kind === 'retire') {
      await db.externalSpeaker.update({ where, data: { archivedAt: byId.get(row.speakerId)?.archivedAt ?? now } })
      counts.retired += 1
    } else {
      await db.externalSpeaker.update({ where, data: { ...speakerData(row.fields), ...link, archivedAt: null } })
      if (row.kind === 'move') counts.moved += 1
      else counts.updated += 1
    }
  }

  await db.speakerCongregation.update({
    where: { id_congregationId: { id: target.id, congregationId } },
    data: {
      ...trimContacts(update.contacts),
      ...(update.listDate == null ? {} : { listDate: update.listDate }),
      ...(update.file == null ? {} : { listFileKey: update.file.key, listFileName: update.file.name }),
    },
  })

  audit({
    action: AuditAction.SpeakerListUpdated,
    congregationId,
    actorId,
    entityType: 'SpeakerCongregation',
    entityId: target.id,
    metadata: { name: target.name, ...counts, withFile: update.file != null },
  })
  return {
    congregationName: target.name,
    ...counts,
    replacedFileKey: update.file == null || target.listFileKey === update.file.key ? null : target.listFileKey,
  }
}
