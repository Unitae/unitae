import { getSession } from '~/features/authentication/server/session.server'
import { resolveCongregation, resolveCongregationFromRequest } from './congregation.server'
import { unscopedDb } from './db.server'

const DEFAULT_LOCALE = 'fr'

export async function resolveLocaleFromRequest(request: Request): Promise<string> {
  // 1. Try session → user → congregation → locale (authenticated users)
  const session = await getSession(request.headers.get('Cookie'))
  const userId = Number(session.get('userId'))

  if (!Number.isNaN(userId)) {
    const user = await unscopedDb.user.findUnique({
      where: { id: userId },
      select: { congregationId: true },
    })

    if (user) {
      const congregation = await resolveCongregation(user.congregationId)
      return congregation.locale
    }
  }

  // 2. Try subdomain/domain → congregation → locale (unauthenticated, multi-tenant)
  const urlCongregation = await resolveCongregationFromRequest(request)

  if (urlCongregation) {
    const congregation = await unscopedDb.congregation.findUnique({
      where: { id: urlCongregation.id },
      select: { locale: true },
    })

    if (congregation) return congregation.locale ?? DEFAULT_LOCALE
  }

  // 3. Single-tenant fallback: first congregation's locale
  if (process.env.MULTI_TENANT !== 'true') {
    const first = await unscopedDb.congregation.findFirst({
      select: { locale: true },
    })

    if (first) return first.locale ?? DEFAULT_LOCALE
  }

  return DEFAULT_LOCALE
}
