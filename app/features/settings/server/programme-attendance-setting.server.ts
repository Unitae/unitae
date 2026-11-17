import { AuditAction, audit } from '~/shared/domain/audit.server'
import { clearSetting, setSetting } from '~/shared/domain/settings.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { CongregationSettingKey } from '~/shared/types/congregation-setting-key'

/**
 * « Afficher l’assistance sur le programme »: whether everyone who reads the programme sees last week's attendance
 * on it. Off is no setting at all, the default for a congregation that never chose.
 */
export async function setProgrammeShowsAttendance(
  db: TransactionClient,
  congregationId: number,
  actorId: number,
  on: boolean,
) {
  const key = CongregationSettingKey.ProgrammeShowsAttendance
  if (on) await setSetting(db, key, 'true', congregationId)
  else await clearSetting(db, key, congregationId)
  audit({
    action: AuditAction.CongregationSettingsUpdated,
    congregationId,
    actorId,
    metadata: { programmeShowsAttendance: on },
  })
}
