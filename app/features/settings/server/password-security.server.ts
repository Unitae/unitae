import { AuditAction, audit } from '~/shared/domain/audit.server'
import { getSetting, setSetting } from '~/shared/domain/settings.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import {
  type BreachedPasswordCheckScope,
  CongregationSettingKey,
  parseBreachedPasswordCheckScope,
} from '~/shared/types/congregation-setting-key'

// La sécurité des mots de passe est un réglage de l'instance Unitae (comment Unitae gère
// l'authentification de l'assemblée), pas un comportement de l'assemblée. Elle vit donc sous
// « Général », mais reste stockée comme un Setting scopé à l'assemblée.
export async function getPasswordSecurityScope(
  db: TransactionClient,
  congregationId: number,
): Promise<BreachedPasswordCheckScope> {
  const stored = await getSetting(db, CongregationSettingKey.BreachedPasswordCheckScope, congregationId)

  return parseBreachedPasswordCheckScope(stored).scope
}

export async function updatePasswordSecurityScope(
  db: TransactionClient,
  congregationId: number,
  actorId: number,
  scope: BreachedPasswordCheckScope,
): Promise<void> {
  await setSetting(db, CongregationSettingKey.BreachedPasswordCheckScope, scope, congregationId)

  audit({
    action: AuditAction.CongregationSettingsUpdated,
    congregationId,
    actorId,
    metadata: { breachedPasswordCheckScope: scope },
  })
}
