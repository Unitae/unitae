import { compare } from '~/shared/auth/crypto.server'
import { unscopedDb as db } from '~/shared/infra/db.server'

import { resetUserPassword } from './reset-user-password.server'

export async function changeUserPassword(userId: number, password: string, newPassword: string) {
  const user = await db.user.findFirst({
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

  await resetUserPassword(userId, newPassword)
  return true
}
