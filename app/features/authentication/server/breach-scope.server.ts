import { resolveEffectivePermissions } from '~/shared/auth/permissions.server'
import { getSetting } from '~/shared/domain/settings.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { CongregationSettingKey } from '~/shared/types/congregation-setting-key'
import { Permission } from '~/shared/types/permission'

// Management-tier permissions: Admin plus every "*-manager" grant. Holding any
// of these means the account can read/manage congregation data, so it is a
// high-value target worth the extra breach check.
const MANAGEMENT_PERMISSIONS: Permission[] = Object.values(Permission).filter(
  permission => permission === Permission.Admin || permission.endsWith('-manager'),
)

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
  const scope = await getSetting(db, CongregationSettingKey.BreachedPasswordCheckScope, congregationId)

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
