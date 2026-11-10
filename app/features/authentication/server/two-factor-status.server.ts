import type { TransactionClient } from '~/shared/infra/db.server'
import { unscopedDb } from '~/shared/infra/db.server'

/**
 * Login-path check: is the account's TOTP challenge armed? Uses `unscopedDb`
 * because it runs before authentication (no tenant scope yet), keyed on the id.
 */
export async function isTwoFactorEnabled(userId: number): Promise<boolean> {
  const account = await unscopedDb.userAccount.findFirst({
    where: { id: userId },
    select: { twoFactorEnabledAt: true },
  })

  return account?.twoFactorEnabledAt != null
}

/** Authenticated read for « Mon compte › Sécurité »: whether it is on, and since when. */
export async function getTwoFactorStatus(
  db: TransactionClient,
  userId: number,
): Promise<{ enabled: boolean; pending: boolean; enabledAt: Date | null }> {
  const account = await db.userAccount.findFirst({
    where: { id: userId },
    select: { twoFactorSecret: true, twoFactorEnabledAt: true },
  })

  return {
    enabled: account?.twoFactorEnabledAt != null,
    pending: account?.twoFactorSecret != null && account?.twoFactorEnabledAt == null,
    enabledAt: account?.twoFactorEnabledAt ?? null,
  }
}
