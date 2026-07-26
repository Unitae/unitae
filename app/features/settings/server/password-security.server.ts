import { AuditAction, audit } from '~/shared/domain/audit.server'
import { getSetting, setSetting } from '~/shared/domain/settings.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'
import {
  type BreachedPasswordCheckScope,
  CongregationSettingKey,
  parseBreachedPasswordCheckScope,
} from '~/shared/types/congregation-setting-key'

// Password security is an instance-level concern (how Unitae handles authentication for the
// congregation), not a congregation behaviour. It therefore lives under « Général », but is still
// stored as a congregation-scoped Setting.
export async function getPasswordSecurityScope(
  db: TransactionClient,
  congregationId: number,
): Promise<BreachedPasswordCheckScope> {
  const stored = await getSetting(db, CongregationSettingKey.BreachedPasswordCheckScope, congregationId)
  const { scope, recognized } = parseBreachedPasswordCheckScope(stored)

  // The column is a free String, also writable by the control plane / a migration / a manual edit.
  // An unreadable value falls back to `off` (fail-closed), but we signal it — otherwise the
  // breached-password protection would silently switch off.
  if (stored != null && !recognized) {
    logger.warn('Unrecognised breached-password-check-scope value, defaulting to "off"', {
      tag: 'password-security',
      congregationId,
      stored,
    })
  }

  return scope
}

export async function updatePasswordSecurityScope(
  db: TransactionClient,
  congregationId: number,
  actorId: number,
  scope: BreachedPasswordCheckScope,
): Promise<void> {
  // Idempotent: the « Général » page always submits this field (defaulting to « off »), so we only
  // write and audit when the value actually changes — otherwise every save of the page (e.g. a mere
  // timezone change) would add a misleading audit entry.
  const current = await getPasswordSecurityScope(db, congregationId)
  if (current === scope) return

  await setSetting(db, CongregationSettingKey.BreachedPasswordCheckScope, scope, congregationId)

  audit({
    action: AuditAction.CongregationSettingsUpdated,
    congregationId,
    actorId,
    metadata: { breachedPasswordCheckScope: scope },
  })
}
