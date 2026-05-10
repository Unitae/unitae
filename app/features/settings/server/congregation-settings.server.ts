import { AuditAction, audit } from '~/shared/domain/audit.server'
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
    await db.member.updateMany({
      where: {
        congregationId,
        type: PublisherType.PionnierAuxiliaires,
      },
      data: {
        type: PublisherType.Normal,
      },
    })
  }

  audit({
    action: AuditAction.CongregationSettingsUpdated,
    congregationId,
    actorId,
    metadata: { auxiliaryPioneerProfileActivated: data.auxiliaryPioneerProfileActivated },
  })
}
