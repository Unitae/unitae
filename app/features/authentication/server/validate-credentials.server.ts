import { compare } from '~/shared/auth/crypto.server'
import { unscopedDb as db } from '~/shared/infra/db.server'

// A fixed, valid scrypt hash (32-hex-char salt + '.' + 64-hex-char key, i.e. a
// 32-byte key matching `keyLength`). It is not the hash of any real password: it
// only exists so `compare` runs the full scrypt + timingSafeEqual on the unknown or
// inactive-user path and always returns false. Without it, those paths would return
// before any scrypt work and leak a timing oracle for account enumeration.
const DECOY_HASH = 'a3f1c9e0b7d24856a3f1c9e0b7d24856.476ba733127aa020464321f8c35c29c0e8976548860928bc0e35869025ffca23'

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
  } catch (_e) {
    return
  }

  if (user == null || user.active !== true) return
  if (!isValid) return

  return user.id
}
