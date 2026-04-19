import { hash } from '~/shared/auth/crypto.server'
import { unscopedDb as db } from '~/shared/infra/db.server'

export async function resetUserPassword(userId: number, password: string) {
  await db.user.update({
    where: {
      id: userId,
    },
    data: {
      password: await hash(password),
    },
  })
}
