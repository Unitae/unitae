import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { EmergencyContactInput } from '../schemas/emergency-info.schema'

// Emergency-info mutations. Lives in a `*.aggregate.ts` file because it writes
// `Member` flags (a guarded aggregate model). `EmergencyContact` itself has no
// invariant and is deliberately NOT added to `AGGREGATE_MODELS`; its writes are
// co-located here only for cohesion with the Member flags they accompany.

export type UpdateEmergencyInfoParams = {
  dpaCardUpToDate: boolean
  survivalBackpackReady: boolean
  contacts: EmergencyContactInput[]
}

export async function updateEmergencyInfo(
  db: TransactionClient,
  memberId: number,
  congregationId: number,
  actorId: number,
  params: UpdateEmergencyInfoParams,
) {
  const member = await db.member.update({
    // biome-ignore lint/style/useNamingConvention: Prisma compound-key naming
    where: { id_congregationId: { id: memberId, congregationId } },
    data: {
      dpaCardUpToDate: params.dpaCardUpToDate,
      survivalBackpackReady: params.survivalBackpackReady,
    },
  })

  // Replace the whole contact set: the form submits the complete desired list,
  // so a diff would only add churn. Delete-then-recreate keeps it simple.
  await db.emergencyContact.deleteMany({ where: { memberId, congregationId } })
  if (params.contacts.length > 0) {
    await db.emergencyContact.createMany({
      data: params.contacts.map(contact => ({
        memberId,
        congregationId,
        name: contact.name,
        relationship: contact.relationship,
        phone: contact.phone,
      })),
    })
  }

  audit({
    action: AuditAction.EmergencyInfoUpdated,
    congregationId,
    actorId,
    entityType: 'Member',
    entityId: memberId,
  })

  return member
}

// Drops every emergency contact of a member. Called from the anonymize path:
// anonymize is an UPDATE (not a row delete), so the `onDelete: Cascade` FK does
// not fire — the third-party PII must be removed explicitly.
export async function purgeEmergencyContacts(db: TransactionClient, memberId: number, congregationId: number) {
  await db.emergencyContact.deleteMany({ where: { memberId, congregationId } })
}
