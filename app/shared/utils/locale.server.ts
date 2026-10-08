import { getSession } from '~/features/authentication/server/session.server'
import { findCongregation, resolveCongregationFromRequest } from '~/shared/domain/congregation.server'
import { unscopedDb } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'

const DEFAULT_LOCALE = 'fr'

export async function resolveLocaleFromRequest(request: Request): Promise<string> {
  // 1. Try session → user → congregation → locale (authenticated users)
  const session = await getSession(request.headers.get('Cookie'))
  const rawUserId = session.get('userId')
  const userId = Number(rawUserId)

  if (rawUserId && !Number.isNaN(userId) && userId > 0) {
    const user = await unscopedDb.userAccount.findUnique({
      where: { id: userId },
      select: { congregationId: true },
    })

    // A congregation deleted under a live session falls through to the request's own.
    const congregation = user ? await findCongregation(user.congregationId) : null
    if (congregation) return congregation.locale
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

  // 3. Single-tenant fallback: first congregation's locale.
  // Ordered for the same reason as getBrandingName: with more than one row present this has to
  // keep resolving to the same congregation instead of alternating between them.
  if (process.env.UNITAE_MULTI_TENANT !== 'true') {
    const first = await unscopedDb.congregation.findFirst({
      select: { locale: true },
      orderBy: { id: 'asc' },
    })

    if (first) return first.locale ?? DEFAULT_LOCALE
  }

  return DEFAULT_LOCALE
}

export type DocumentLocale = { locale: string } | { redirect: Response }

/**
 * The locale entry.server renders a document in, or the redirect to answer with instead.
 *
 * It runs after the loaders, where React Router no longer turns a thrown Response into the
 * response: it re-renders, the lookup throws again, and the visitor gets the last-resort 500. So
 * the redirect resolveCongregationFromRequest throws for a subdomain no congregation owns comes
 * back as a value — except on the page it points to, which renders instead of redirecting to
 * itself. Any other failure falls back to the default locale: the locale only picks a language,
 * and must not take the page down with it.
 */
export async function resolveDocumentLocale(request: Request): Promise<DocumentLocale> {
  try {
    return { locale: await resolveLocaleFromRequest(request) }
  } catch (error) {
    if (error instanceof Response) {
      return redirectsToItself(request, error) ? { locale: DEFAULT_LOCALE } : { redirect: error }
    }
    logger.error('resolveDocumentLocale: locale lookup failed, rendering in the default locale', { error })
    return { locale: DEFAULT_LOCALE }
  }
}

function redirectsToItself(request: Request, response: Response): boolean {
  const location = response.headers.get('Location')
  if (location == null) return false
  const current = new URL(request.url)
  return new URL(location, current).pathname === current.pathname
}
