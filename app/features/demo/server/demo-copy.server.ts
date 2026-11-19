// A demo copy while a visitor uses it (docs/development/specs/demo-mode.md): its expiry, pushed by activity, and the
// role the signed-in login stands for.

import { DEMO_ROLES, type DemoRole } from '~/features/demo/model/demo-role'
import { isDemoModeEnabled, nextDemoExpiry } from '~/features/demo/server/demo-mode.server'
import { readDemoAccounts } from '~/features/demo/server/demo-sign-in.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { unscopedDb } from '~/shared/infra/db.server'

/**
 * Pushes a copy's expiry after a request (an hour on, 24 hours at most), written at most once a minute. Conditional on
 * the expiry it read: two requests at once write once, and a copy the control plane is deleting isn't revived.
 */
export async function touchDemoCopy(
  congregation: { id: number; demoExpiresAt: Date | null; demoReadyAt: Date | null },
  now: Date = new Date(),
): Promise<void> {
  if (!isDemoModeEnabled() || congregation.demoExpiresAt == null || congregation.demoReadyAt == null) return
  const next = nextDemoExpiry({ now, readyAt: congregation.demoReadyAt, expiresAt: congregation.demoExpiresAt })
  if (next == null) return
  await unscopedDb.congregation.updateMany({
    where: { id: congregation.id, demoExpiresAt: congregation.demoExpiresAt },
    data: { demoExpiresAt: next },
  })
}

/** The role this login is the copy's login for, as the banner names it; `null` for any other login. */
export async function demoRoleOf(
  db: TransactionClient,
  congregationId: number,
  accountId: number,
): Promise<DemoRole | null> {
  const accounts = await readDemoAccounts(db, congregationId)
  return DEMO_ROLES.find(role => accounts[role] === accountId) ?? null
}
