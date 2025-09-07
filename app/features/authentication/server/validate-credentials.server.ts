import { compare } from '~/shared/libs/crypto.server'
import { unscopedDb as db } from '~/shared/libs/db.server'

export async function validateCredentials(email: string, password: string) {
  const user = await db.user.findFirst({
    where: {
      email: email.toLowerCase(),
    },
  })

  if (user == null) return
  if (user.active !== true) return

  try {
    const isValid = await compare(password, user.password)
    if (!isValid) return
  } catch (_e) {
    return
  }

  return user.id
}
