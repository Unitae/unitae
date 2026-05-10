import { compare } from '~/shared/auth/crypto.server'
import { unscopedDb as db } from '~/shared/infra/db.server'

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
  } catch (_e) {
    return false
  }

  await resetAccountPassword(userId, newPassword)
  return true
}
