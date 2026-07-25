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
