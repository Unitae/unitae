import { AuditAction, audit } from '~/shared/domain/audit.server'
import { syncBuiltInRoleAssignments } from '~/shared/domain/built-in-roles.server'
import { setSetting } from '~/shared/domain/settings.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { CongregationSettingKey } from '~/shared/types/congregation-setting-key'
import { PublisherType } from '~/shared/types/publisher-type'

export async function updateCongregationSettings(
  db: TransactionClient,
  congregationId: number,
  actorId: number,
  data: {
    auxiliaryPioneerProfileActivated: string
  },
) {
  await setSetting(
    db,
    CongregationSettingKey.AuxiliaryPioneerProfileActivated,
    data.auxiliaryPioneerProfileActivated,
    congregationId,
  )

  if (data.auxiliaryPioneerProfileActivated === 'false') {
    // The bulk type flip drops affected members out of the `pioneer` built-in
    // role predicate. Capture the IDs BEFORE the update so we can sync each
    // member's role assignments after.
    // TODO(wave-5): replace with Member.bulkUpdateType aggregate method, which
    // owns the sync internally.
    const affectedMembers = await db.member.findMany({
      where: { congregationId, type: PublisherType.PionnierAuxiliaires },
      select: { id: true },
    })

    await db.member.updateMany({
      where: {
        congregationId,
        type: PublisherType.PionnierAuxiliaires,
      },
      data: {
        type: PublisherType.Normal,
      },
    })

    for (const member of affectedMembers) {
      await syncBuiltInRoleAssignments(db, member.id, congregationId, actorId)
    }
  }

  audit({
    action: AuditAction.CongregationSettingsUpdated,
    congregationId,
    actorId,
    metadata: { auxiliaryPioneerProfileActivated: data.auxiliaryPioneerProfileActivated },
  })
}
