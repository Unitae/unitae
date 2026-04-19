import { redirect } from 'react-router'
// Intentional cross-feature import: platform-admin depends on authentication for session management
import { getSession } from '~/features/authentication/server/session.server'
import { unscopedDb } from '~/shared/infra/db.server'

export async function verifyPlatformAdmin(request: Request) {
  const session = await getSession(request.headers.get('Cookie'))
  const userId = Number(session.get('userId'))

  if (Number.isNaN(userId)) {
    throw redirect('/login')
  }

  const user = await unscopedDb.user.findUnique({ where: { id: userId } })

  if (!user?.platformAdmin) {
    throw redirect('/')
  }

  return { userId: user.id, email: user.email, congregationId: user.congregationId }
}
