import { createContext, type RouterContext } from 'react-router'

import { baseLocale, type Locale } from '~/i18n/paraglide/runtime'
import logger from '~/shared/infra/logger.server'
import { type DocumentLocale, resolveDocumentLocale } from '~/shared/utils/locale.server'
import { localeCookie, localeFromCookie } from '~/shared/utils/locale-cookie'
import { runWithLocale } from '~/shared/utils/locale-scope.server'

/**
 * What {@link requestLocale} resolved for this request. `null` when it did not run: React Router
 * skips middleware for a path no route matches, and entry.server then resolves the document itself.
 */
export const documentLocaleContext = createContext<DocumentLocale | null>(null)

interface MiddlewareArgs {
  request: Request
  context: {
    set<C extends RouterContext>(context: C, value: C extends RouterContext<infer T> ? T : never): void
  }
}

/**
 * Resolves the request's locale before any loader or action runs, and runs them in it. Applying it
 * in entry.server alone left them in the base locale: React Router calls entry.server last.
 *
 * It also writes the locale cookie the client translates with on every response that changes it,
 * data requests included, which never reach entry.server.
 *
 * A subdomain no congregation owns resolves to a redirect. This runs for resource routes too, so it
 * does not answer with it: entry.server does, for documents, and everything else carries on in the
 * visitor's locale.
 */
export function requestLocale() {
  return async ({ request, context }: MiddlewareArgs, next: () => Promise<Response>) => {
    const resolved = await resolveDocumentLocale(request)
    context.set(documentLocaleContext, resolved)

    if ('redirect' in resolved) {
      return runWithLocale(localeFromCookie(request) ?? baseLocale, next)
    }

    const response = await runWithLocale(resolved.locale, next)
    if (resolved.persist) rememberLocale(request, response.headers, resolved.locale)
    return response
  }
}

/** Points the visitor's locale cookie at `locale`, unless it already holds it. */
export function rememberLocale(request: Request, headers: Headers, locale: Locale): void {
  if (localeFromCookie(request) === locale) return
  try {
    headers.append('Set-Cookie', localeCookie(locale))
  } catch (error) {
    // Immutable headers (Response.redirect, a proxied fetch). The response goes out without the
    // cookie: the server resolves the locale again next time, and the next response writes it.
    logger.warn('requestLocale: could not write the locale cookie', { error })
  }
}
