import { compare } from '~/shared/auth/crypto.server'
import { unscopedDb as db } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'

import { resetAccountPassword } from './reset-account-password.server'

export async function changeAccountPassword(userId: number, password: string, newPassword: string) {
  const user = await db.userAccount.findFirst({
    where: {
      id: userId,
    },
  })

  if (user == null) return false

  try {
    const isValid = await compare(password, user.password)
    if (!isValid) return false
  } catch (error) {
    // A throw here means a corrupt stored hash for this user or a systemic scrypt/crypto fault —
    // never silently indistinguishable from a wrong current password. Log (userId only, never the
    // password) so operators can tell the two apart, then fail closed. Mirrors validateCredentials.
    logger.error('Password comparison failed during password change', { userId, error })
    return false
  }

  await resetAccountPassword(userId, newPassword)
  return true
}
