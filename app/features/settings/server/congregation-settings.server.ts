import { setSetting } from '~/shared/domain/settings.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { unscopedDb } from '~/shared/infra/db.server'
import { CongregationSettingKey } from '~/shared/types/congregation-setting-key'
import { PublisherType } from '~/shared/types/publisher-type'

export async function updateCongregationSettings(
  db: TransactionClient,
  congregationId: number,
  data: {
    displayName: string | null
    auxiliaryPioneerProfileActivated: string
  },
) {
  await unscopedDb.congregation.update({
    where: { id: congregationId },
    data: { displayName: data.displayName },
  })

  await setSetting(
    db,
    CongregationSettingKey.AuxiliaryPioneerProfileActivated,
    data.auxiliaryPioneerProfileActivated,
    congregationId,
  )

  if (data.auxiliaryPioneerProfileActivated === 'false') {
    await db.user.updateMany({
      where: {
        congregationId,
        type: PublisherType.PionnierAuxiliaires,
      },
      data: {
        type: PublisherType.Normal,
      },
    })
  }
}
