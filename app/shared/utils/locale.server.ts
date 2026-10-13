import { getSession } from '~/features/authentication/server/session.server'
import { baseLocale, isLocale, type Locale } from '~/i18n/paraglide/runtime'
import { findCongregation, resolveCongregationFromRequest } from '~/shared/domain/congregation.server'
import { unscopedDb } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'

const DEFAULT_LOCALE = 'fr'
const LOCALE_COOKIE = /(?:^|;\s*)PARAGLIDE_LOCALE=([^;]+)/

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

    // No account or no congregation behind the session: resolve as for an anonymous request (steps 2 and 3).
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

/**
 * `persist: false` marks a locale nobody chose — the lookup failed, or there is no congregation to
 * ask: the document renders in it, and the visitor's locale cookie is left as it is.
 */
export type DocumentLocale = { locale: Locale; persist: boolean } | { redirect: Response }

/**
 * The locale entry.server renders a document in, or the redirect to answer with instead.
 *
 * It runs after the loaders, where React Router no longer turns a thrown Response into the
 * response: it re-renders, the lookup throws again, and the visitor gets the last-resort 500. So
 * the redirect resolveCongregationFromRequest throws for a subdomain no congregation owns comes
 * back as a value — except on the page it points to, which renders instead of redirecting to
 * itself. Any other failure, a thrown Response that is not a redirect included, falls back to the
 * locale the visitor already has, or the base one: the locale only picks a language, and must not
 * take the page down with it.
 */
export async function resolveDocumentLocale(request: Request): Promise<DocumentLocale> {
  try {
    const locale = await resolveLocaleFromRequest(request)
    return { locale: isLocale(locale) ? locale : baseLocale, persist: true }
  } catch (error) {
    if (!isRedirect(error)) {
      const { host, pathname } = new URL(request.url)
      logger.error('resolveDocumentLocale: locale lookup failed, rendering in a fallback locale', {
        // A Response has no enumerable fields: logged as it is, it would read `{}`.
        error: error instanceof Response ? `Response ${error.status}` : error,
        host,
        path: pathname,
      })
    } else if (!redirectsToItself(request, error)) {
      return { redirect: error }
    }
    return { locale: localeFromCookie(request) ?? baseLocale, persist: false }
  }
}

function isRedirect(error: unknown): error is Response {
  return error instanceof Response && error.status >= 300 && error.status < 400 && error.headers.has('Location')
}

function redirectsToItself(request: Request, redirect: Response): boolean {
  const current = new URL(request.url)
  return new URL(redirect.headers.get('Location') ?? '', current).pathname === current.pathname
}

function localeFromCookie(request: Request): Locale | null {
  const value = LOCALE_COOKIE.exec(request.headers.get('Cookie') ?? '')?.[1]
  return isLocale(value) ? value : null
}
