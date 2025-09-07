import { hash } from '~/shared/libs/crypto.server'
import { unscopedDb as db } from '~/shared/libs/db.server'

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
