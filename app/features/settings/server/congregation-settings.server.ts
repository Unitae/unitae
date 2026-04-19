import type { TransactionClient } from '~/shared/libs/db.server'
import { unscopedDb } from '~/shared/libs/db.server'
import { CongregationSettingKey } from '~/shared/types/congregation-setting-key'
import { PublisherType } from '~/shared/types/publisher-type'
import { setSetting } from '~/shared/libs/settings.server'

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
