import { endOngoingEnrolmentsOfType } from '~/features/publishers/index.server'
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
  // The congregation's own clock, not the server's. Closing a stint picks a MONTH, so a server an
  // hour either side of midnight on the 1st would otherwise date it to the wrong one.
  now: Date,
) {
  await setSetting(
    db,
    CongregationSettingKey.PermanentAuxiliaryPioneerProfileActivated,
    data.auxiliaryPioneerProfileActivated,
    congregationId,
  )

  if (data.auxiliaryPioneerProfileActivated === 'false') {
    // Turning the profile off means these members stop being permanent auxiliaries. That fact lives
    // on the stint now, so close the ongoing ones at the current month rather than flipping a cached
    // column — closing keeps the history of what they actually did.
    await endOngoingEnrolmentsOfType(db, congregationId, actorId, PublisherType.PionnierAuxiliaires, {
      endMonth: now.getMonth(),
      endYear: now.getFullYear(),
    })
  }

  audit({
    action: AuditAction.CongregationSettingsUpdated,
    congregationId,
    actorId,
    metadata: {
      auxiliaryPioneerProfileActivated: data.auxiliaryPioneerProfileActivated,
    },
  })
}
