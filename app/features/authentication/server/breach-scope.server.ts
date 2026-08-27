import { resolveEffectivePermissions } from '~/shared/auth/permissions.server'
import { getSetting } from '~/shared/domain/settings.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import { CongregationSettingKey, parseBreachedPasswordCheckScope } from '~/shared/types/congregation-setting-key'
import { Permission } from '~/shared/types/permission'

const logger = createLogger('breach-scope')

// Management-tier permissions: holding any of these means the account can read or
// change congregation data, so it is a high-value target worth the extra breach check.
//
// Listed explicitly rather than derived from the key. This used to be
// `permission === Admin || permission.endsWith('-manager')`, which silently matched
// nothing the moment permissions were renamed to `can-*` — a security control must not
// depend on a naming convention holding. The set below is the successor of what that
// test used to select, so the scope is unchanged.
const MANAGEMENT_PERMISSIONS: Permission[] = [
  Permission.CanDoAnything,
  // was territories-manager / prospection-manager
  Permission.CanManageTerritories,
  Permission.CanManageTerritoryAttributions,
  Permission.CanManageTerritoryCampaigns,
  Permission.CanPlanTerritorySplits,
  Permission.CanConfigureTerritorySettings,
  Permission.CanRecordProspection,
  Permission.CanManageBuildings,
  // was publisher-manager
  Permission.CanManagePublishers,
  Permission.CanManagePublisherLifecycle,
  Permission.CanManagePublisherGroups,
  // was activity-manager
  Permission.CanRecordActivity,
  Permission.CanCorrectActivity,
  // was emergency-info-manager
  Permission.CanManageEmergencyInfo,
  // was program-manager
  Permission.CanManagePrograms,
  Permission.CanAssignProgramParts,
  Permission.CanPublishPrograms,
  Permission.CanManageProgramTemplates,
  // was external-speaker-manager / pioneer-goal-manager
  Permission.CanManageExternalSpeakers,
  Permission.CanSetPioneerGoals,
  // was settings-user-manager / roles-manager / permissions-manager
  Permission.CanViewUsers,
  Permission.CanManageUsers,
  Permission.CanManageRoles,
  Permission.CanConfigurePermissions,
  // split out of admin
  Permission.CanConfigureCongregation,
  Permission.CanExportCongregationData,
  Permission.CanImportCongregationData,
  Permission.CanDeleteUserAccounts,
  Permission.CanAnonymisePeople,
]

/**
 * Whether the given account is in scope for the optional breached-password
 * check, per the congregation's `BreachedPasswordCheckScope` policy:
 *   - `off` / unset → never
 *   - `everyone`    → always
 *   - `responsibilities` → union of "appointed" (elder/ministerial servant,
 *     i.e. Member.isHelder || isServant) OR "has management access".
 */
export async function isAccountInBreachScope(
  db: TransactionClient,
  userId: number,
  congregationId: number,
): Promise<boolean> {
  const raw = await getSetting(db, CongregationSettingKey.BreachedPasswordCheckScope, congregationId)
  const { scope, recognized } = parseBreachedPasswordCheckScope(raw)

  // A non-empty value that isn't a known scope means the shared Setting drifted
  // (control-plane write, migration, manual edit). Fail closed to `off`, but log
  // so an admin who believes the check is on learns it is silently disabled.
  if (raw != null && raw !== '' && !recognized) {
    logger.warn('Unrecognized breached-password check scope; treating as off', { rawScope: raw, congregationId })
  }

  if (scope === 'everyone') return true
  if (scope !== 'responsibilities') return false

  const [account, permissions] = await Promise.all([
    db.userAccount.findFirst({
      where: { id: userId },
      select: { member: { select: { isHelder: true, isServant: true } } },
    }),
    resolveEffectivePermissions(userId, congregationId),
  ])

  const appointed = account?.member?.isHelder === true || account?.member?.isServant === true
  const hasManagementAccess = MANAGEMENT_PERMISSIONS.some(permission => permissions.has(permission))

  return appointed || hasManagementAccess
}
