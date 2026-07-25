import { memberAggregate } from '~/features/publishers/index.server'
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
    breachedPasswordCheckScope?: string
  },
) {
  await setSetting(
    db,
    CongregationSettingKey.AuxiliaryPioneerProfileActivated,
    data.auxiliaryPioneerProfileActivated,
    congregationId,
  )

  if (data.breachedPasswordCheckScope != null) {
    await setSetting(
      db,
      CongregationSettingKey.BreachedPasswordCheckScope,
      data.breachedPasswordCheckScope,
      congregationId,
    )
  }

  if (data.auxiliaryPioneerProfileActivated === 'false') {
    await memberAggregate.bulkUpdateType(
      db,
      congregationId,
      actorId,
      PublisherType.PionnierAuxiliaires,
      PublisherType.Normal,
    )
  }

  audit({
    action: AuditAction.CongregationSettingsUpdated,
    congregationId,
    actorId,
    metadata: {
      auxiliaryPioneerProfileActivated: data.auxiliaryPioneerProfileActivated,
      ...(data.breachedPasswordCheckScope != null
        ? { breachedPasswordCheckScope: data.breachedPasswordCheckScope }
        : {}),
    },
  })
}
