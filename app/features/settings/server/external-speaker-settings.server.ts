import { AuditAction, audit } from '~/shared/domain/audit.server'
import { BUILT_IN_ROLE_KEYS, SERVICE_COMMITTEE_KEY, SYSTEM_ROLE_KEYS } from '~/shared/domain/built-in-roles.server'
import { clearSetting, setSetting } from '~/shared/domain/settings.server'
import { NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { CongregationSettingKey } from '~/shared/types/congregation-setting-key'

// Réglages › Orateurs extérieurs: which organigram role holds the brothers who may go on the list we send, and which
// role is our public talk coordinator. Stored by role key, which an archive import keeps, rather than by id.

export interface ExternalSpeakerSettings {
  candidatesRoleKey: string | null
  responsibleRoleKey: string | null
}

/**
 * The roles the picker offers: the organigram's posts and teams, built-in or custom. Not those synced from the records
 * (« Anciens », « Proclamateurs »: nobody is put in them on purpose), not the service committee (its members come from
 * its posts), not the administrator's.
 */
export const NOT_OFFERED_ROLE_KEYS: readonly string[] = [
  ...BUILT_IN_ROLE_KEYS,
  SERVICE_COMMITTEE_KEY,
  ...SYSTEM_ROLE_KEYS,
]

async function assertRole(db: TransactionClient, congregationId: number, key: string) {
  if (NOT_OFFERED_ROLE_KEYS.includes(key)) throw new NotFoundError('Role')
  const role = await db.role.findFirst({ where: { key, congregationId }, select: { key: true } })
  if (!role) throw new NotFoundError('Role')
}

export async function updateExternalSpeakerSettings(
  db: TransactionClient,
  congregationId: number,
  actorId: number,
  settings: ExternalSpeakerSettings,
) {
  const entries = [
    [CongregationSettingKey.ExternalSpeakersCandidatesRole, settings.candidatesRoleKey],
    [CongregationSettingKey.ExternalSpeakersResponsibleRole, settings.responsibleRoleKey],
  ] as const
  for (const [, key] of entries) if (key != null) await assertRole(db, congregationId, key)
  for (const [setting, key] of entries) {
    if (key == null) await clearSetting(db, setting, congregationId)
    else await setSetting(db, setting, key, congregationId)
  }
  audit({
    action: AuditAction.CongregationSettingsUpdated,
    congregationId,
    actorId,
    metadata: { externalSpeakers: settings },
  })
}
