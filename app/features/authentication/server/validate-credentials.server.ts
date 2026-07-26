import { compare, hash, needsRehash } from '~/shared/auth/crypto.server'
import { unscopedDb as db } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'

// A fixed, valid scrypt hash in the current self-describing format (`scrypt$N$r$p$salt$key`,
// with a 32-byte / 64-hex key matching `keyLength`). It is not the hash of any real password:
// it only exists so `compare` runs the full scrypt + timingSafeEqual on the unknown or
// inactive-user path and always returns false. Without it, those paths would return before any
// scrypt work and leak a timing oracle for account enumeration. It pins the CURRENT parameters
// (N=2^17) so the decoy path costs the same as verifying a real, current-format hash.
//
// KNOWN, SHRINKING WINDOW: a not-yet-migrated legacy account still verifies at N=2^14, ~8x
// cheaper than this decoy, so a wrong-password probe against such an account is measurably
// faster than an unknown-email probe — a residual enumeration signal for the legacy cohort.
// A single fixed-cost decoy cannot equalize a mixed-cost population; this is accepted because
// rehash-on-login converges every account to N=2^17 over time (see the rehash block below).
//
// Exported so a unit test can prove it stays well-formed (a malformed decoy makes `compare`
// reject before scrypt, silently reintroducing the timing oracle).
export const DECOY_HASH =
  'scrypt$131072$8$1$a3f1c9e0b7d24856a3f1c9e0b7d24856$476ba733127aa020464321f8c35c29c0e8976548860928bc0e35869025ffca23'

export async function validateCredentials(email: string, password: string, congregationId?: number) {
  const user = await db.userAccount.findFirst({
    where: {
      email: email.toLowerCase(),
      ...(congregationId != null ? { congregationId } : {}),
    },
  })

  // Always pay the scrypt cost, even with no active user, to equalize timing.
  const passwordHash = user?.active === true ? user.password : DECOY_HASH

  let isValid = false
  try {
    isValid = await compare(password, passwordHash)
  } catch (error) {
    // Fail closed, but never silently: a throw here means a corrupt stored hash for a
    // single user, or a systemic scrypt/crypto fault denying every login. Both must be
    // visible. Log the user id (never the email/password) so operators can tell the two
    // apart at a glance.
    logger.error('Credential comparison failed', { userId: user?.id, hadUser: user != null, error })
    return
  }

  if (user == null || user.active !== true) return
  if (!isValid) return

  // Transparent upgrade: if this hash predates the current scrypt cost, re-hash it now that we
  // hold the plaintext. A failed rewrite must never block an otherwise valid login, so it is
  // logged and swallowed — the next successful login will simply try again.
  if (needsRehash(user.password)) {
    try {
      await db.userAccount.update({ where: { id: user.id }, data: { password: await hash(password) } })
    } catch (error) {
      logger.error('Password rehash-on-login failed', { userId: user.id, error })
    }
  }

  return user.id
}
