import { hash } from '~/shared/libs/crypto.server'
import { unscopedDb as db } from '~/shared/libs/db.server'

export async function setupFirstUser(email: string, password: string, congregationName: string, congregationSlug: string) {
  const hashedPassword = await hash(password)

  const congregation = await db.congregation.create({
    data: {
      name: congregationName,
      slug: congregationSlug,
    },
  })

  const user = await db.user.create({
    data: {
      email,
      password: hashedPassword,
      congregationId: congregation.id,
    },
  })

  const adminRole = await db.userRole.findUnique({ where: { key: 'admin' } })
  if (adminRole) {
    await db.congregationUserRole.create({
      data: {
        userId: user.id,
        roleId: adminRole.id,
        congregationId: congregation.id,
      },
    })
  }

  return user.id
}
