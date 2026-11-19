// Entering a demo copy: the one-time link the control plane writes, and the login each role signs in as.

import { DEMO_ACCOUNTS_SETTING, type DemoRole, isDemoRole } from '~/features/demo/model/demo-role'
import { hashToken } from '~/shared/auth/crypto.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'

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

/**
 * The copy's role logins, as the demo seed recorded them in the `demoAccounts` setting: numeric values only. Empty
 * when there's none, or when it can't be read (logged: the seed writes it, so that's corrupt data).
 */
export async function readDemoAccounts(
  db: TransactionClient,
  congregationId: number,
): Promise<Partial<Record<DemoRole, number>>> {
  const setting = await db.setting.findFirst({ where: { key: DEMO_ACCOUNTS_SETTING, congregationId } })
  if (!setting) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(setting.value)
  } catch (error) {
    logger.error('Demo accounts setting unreadable', { congregationId, error })
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null) return {}
  const accounts: Partial<Record<DemoRole, number>> = {}
  for (const [role, account] of Object.entries(parsed)) {
    if (isDemoRole(role) && typeof account === 'number') accounts[role] = account
  }
  return accounts
}

/** The login a role signs in as in this copy, checked to be this copy's own. */
export async function demoAccountFor(
  db: TransactionClient,
  congregationId: number,
  role: DemoRole,
): Promise<number | null> {
  const account = (await readDemoAccounts(db, congregationId))[role]
  if (account == null) return null
  const login = await db.userAccount.findFirst({ where: { id: account, congregationId }, select: { id: true } })
  return login?.id ?? null
}
