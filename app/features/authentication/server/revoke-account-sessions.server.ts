import { unscopedDb as db } from '~/shared/infra/db.server'

// Revoke every session currently issued for an account by bumping its epoch. The next
// request carrying an older epoch is rejected in verifySession. Used by admin invalidation
// to kick an active attacker immediately, before the legitimate user completes a reset.
export async function revokeAccountSessions(userId: number) {
  await db.userAccount.update({
    where: { id: userId },
    data: { sessionEpoch: { increment: 1 } },
  })
}

// End every session of an account on behalf of one of its sessions (logout). Only a session that
// is still current may do it: its epoch must match, and the account must be active and not
// anonymized, the same conditions the session check applies. A stale or revoked cookie therefore
// cannot sign the real user out. One conditional update, so a concurrent bump cannot be lost.
// Returns whether the sessions were ended.
export async function endCurrentSessions(userId: number, sessionEpoch: number): Promise<boolean> {
  const { count } = await db.userAccount.updateMany({
    where: { id: userId, sessionEpoch, active: true, anonymizedAt: null },
    data: { sessionEpoch: { increment: 1 } },
  })
  return count === 1
}
