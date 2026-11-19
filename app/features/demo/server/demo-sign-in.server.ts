// Entering a demo copy: the one-time link the control plane writes, and the login each role signs in as.

import { DEMO_ACCOUNTS_SETTING, type DemoRole, isDemoRole } from '~/features/demo/model/demo-role'
import { hashToken } from '~/shared/auth/crypto.server'
import type { TransactionClient } from '~/shared/infra/db.server'

/**
 * Spends a sign-in token and gives the role it opens, or `null` when it's unknown, used, expired, another copy's, or
 * names a role the demo doesn't have. One conditional update: two requests with the same link can't both pass.
 */
export async function consumeDemoSignInToken(
  db: TransactionClient,
  rawToken: string,
  congregationId: number,
  now: Date = new Date(),
): Promise<DemoRole | null> {
  if (!rawToken) return null
  const token = hashToken(rawToken)
  const spent = await db.demoSignInToken.updateMany({
    where: { token, congregationId, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  })
  if (spent.count !== 1) return null
  const row = await db.demoSignInToken.findUnique({ where: { token }, select: { role: true } })
  return isDemoRole(row?.role) ? row.role : null
}

/** The login a role signs in as in this copy, as the demo seed recorded it. */
export async function demoAccountFor(
  db: TransactionClient,
  congregationId: number,
  role: DemoRole,
): Promise<number | null> {
  const setting = await db.setting.findFirst({ where: { key: DEMO_ACCOUNTS_SETTING, congregationId } })
  if (!setting) return null
  try {
    const accounts = JSON.parse(setting.value) as Partial<Record<DemoRole, unknown>>
    const account = accounts[role]
    return typeof account === 'number' ? account : null
  } catch {
    return null
  }
}
