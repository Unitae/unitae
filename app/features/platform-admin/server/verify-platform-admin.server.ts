import { redirect } from 'react-router'
import { getSession } from '~/features/authentication/server/session.server'
import { unscopedDb } from '~/shared/libs/db.server'

export async function verifyPlatformAdmin(request: Request) {
  const session = await getSession(request.headers.get('Cookie'))
  const userId = Number(session.get('userId'))

  if (Number.isNaN(userId)) {
    throw redirect('/login')
  }

  const user = await unscopedDb.user.findUnique({ where: { id: userId } })

  if (!user || !user.platformAdmin) {
    throw redirect('/')
  }

  return { userId: user.id, email: user.email }
}
