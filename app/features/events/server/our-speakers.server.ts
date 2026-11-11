import type { ContactMode } from '~/features/events/model/our-speaker.type'
import { tidyTalks } from '~/features/events/server/external-speakers.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { getSetting } from '~/shared/domain/settings.server'
import { ConflictError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { CongregationSettingKey } from '~/shared/types/congregation-setting-key'

// Writes to « Notre liste ». Reads live in our-speakers.queries.ts.

export interface OurSpeakerInput {
  onList: boolean
  talks: number[]
  phoneMode: ContactMode
  phoneCustom: string
  phone2: string
  emailMode: ContactMode
  emailCustom: string
  email2: string
  note: string
}

/** Only a member of the role chosen in Réglages, still in the congregation, has an entry. */
async function assertCandidate(db: TransactionClient, congregationId: number, memberId: number) {
  const roleKey = await getSetting(db, CongregationSettingKey.ExternalSpeakersCandidatesRole, congregationId)
  if (roleKey == null) throw new ConflictError('No candidates role chosen')
  const seat = await db.memberRoleAssignment.findFirst({
    where: { congregationId, memberId, role: { key: roleKey }, member: { leftAt: null, anonymizedAt: null } },
    select: { memberId: true },
  })
  if (!seat) throw new ConflictError('Not a candidate for our list')
}

export async function updateOurSpeaker(
  db: TransactionClient,
  congregationId: number,
  actorId: number,
  memberId: number,
  input: OurSpeakerInput,
) {
  await assertCandidate(db, congregationId, memberId)
  const fields = {
    onList: input.onList,
    talks: tidyTalks(input.talks),
    phoneMode: input.phoneMode,
    phoneCustom: input.phoneCustom.trim(),
    phone2: input.phone2.trim(),
    emailMode: input.emailMode,
    emailCustom: input.emailCustom.trim(),
    email2: input.email2.trim(),
    note: input.note.trim(),
  }
  const entry = await db.ourSpeaker.upsert({
    where: { memberId },
    create: { ...fields, memberId, congregationId },
    update: fields,
  })
  audit({
    action: AuditAction.OurSpeakerUpdated,
    congregationId,
    actorId,
    entityType: 'Member',
    entityId: memberId,
    metadata: { onList: fields.onList },
  })
  return entry
}

/** Our list went to these congregations at `sentAt`: by the app's e-mail, or by hand (`manual`). */
export async function markOurListSent(
  db: TransactionClient,
  congregationId: number,
  actorId: number,
  {
    speakerCongregationIds,
    sentAt,
    manual,
    digest,
  }: {
    speakerCongregationIds: number[]
    sentAt: Date
    manual: boolean
    /** The digest of the list they received (`OurSpeakerListPage.digest`). */
    digest: string
  },
) {
  const { count } = await db.speakerCongregation.updateMany({
    where: { congregationId, id: { in: speakerCongregationIds } },
    data: { ourListSentAt: sentAt, ourListSentManually: manual, ourListSentDigest: digest },
  })
  audit({
    action: AuditAction.OurSpeakerListSent,
    congregationId,
    actorId,
    metadata: { speakerCongregationIds, manual },
  })
  return count
}

/** A member anonymised leaves our list with everything he shared. */
export async function removeOurSpeakerEntry(db: TransactionClient, congregationId: number, memberId: number) {
  await db.ourSpeaker.deleteMany({ where: { congregationId, memberId } })
}
