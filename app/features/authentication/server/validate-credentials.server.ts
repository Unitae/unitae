import { unscopedDb as db } from '~/shared/infra/db.server'
import { compare } from '~/shared/auth/crypto.server'

export async function validateCredentials(email: string, password: string, congregationId?: number) {
  const user = await db.user.findFirst({
    where: {
      email: email.toLowerCase(),
      ...(congregationId != null ? { congregationId } : {}),
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
