import { AuditAction, audit } from '~/shared/domain/audit.server'
import { syncBuiltInRoleAssignments } from '~/shared/domain/built-in-roles.server'
import { ConflictError, NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'

/**
 * Anonymize a Member: scrub PII, clear identity flags, stamp `anonymizedAt`.
 * `isPublisher` and `type` are preserved so historical `PublisherActivity`
 * rows still aggregate correctly under the anonymized identity. Drops deputy
 * group assignment (`deputyId` is nullable). Closes any open attribution.
 *
 * The Member row is kept (not deleted) — anonymization is GDPR Article 17
 * with referential integrity preserved.
 */
export async function anonymizeMember(
  db: TransactionClient,
  memberId: number,
  congregationId: number,
  actorId: number,
): Promise<void> {
  const member = await db.member.findFirst({
    where: { id: memberId, congregationId },
    select: { id: true, anonymizedAt: true },
  })

  if (!member) throw new NotFoundError('Member')
  if (member.anonymizedAt) throw new ConflictError('Member already anonymized')

  await db.member.update({
    where: { id_congregationId: { id: memberId, congregationId } },
    data: {
      firstname: 'Utilisateur',
      lastname: 'supprime',
      phone: '',
      address: '',
      birthDate: null,
      baptismDate: null,
      isMale: null,
      isHelder: false,
      isServant: false,
      isAnointed: false,
      anonymizedAt: new Date(),
    },
  })

  await db.publisherGroup.updateMany({
    where: { deputyId: memberId },
    data: { deputyId: null },
  })

  await db.attribution.updateMany({
    where: { publisherId: memberId, endDate: null },
    data: { endDate: new Date() },
  })

  // Predicates evaluate against the now-cleared flags → every built-in role
  // assignment is removed.
  await syncBuiltInRoleAssignments(db, memberId, congregationId, null)

  await db.dataDeletionRecord.create({
    data: {
      entityType: 'Member',
      entityId: memberId,
      congregationId,
      requestedBy: `admin:${actorId}`,
      completedAt: new Date(),
    },
  })

  audit({
    action: AuditAction.UserAnonymized,
    congregationId,
    actorId,
    entityType: 'Member',
    entityId: memberId,
  })
}
