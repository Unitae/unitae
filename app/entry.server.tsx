import '~/shared/infra/boot.server'
import '~/shared/infra/graceful-exit.server'
import { PassThrough } from 'node:stream'

import { createReadableStreamFromReadable } from '@react-router/node'
import { isbot } from 'isbot'
import { renderToPipeableStream } from 'react-dom/server'
import type { EntryContext, HandleErrorFunction, RouterContextProvider } from 'react-router'
import { ServerRouter } from 'react-router'

import logger from '~/shared/infra/logger.server'
import { describeRequestError } from '~/shared/infra/request-error.server'
import { documentLocaleContext, rememberLocale } from '~/shared/middleware/locale.server'
import { nonceContext } from '~/shared/middleware/security-headers.server'
import { resolveDocumentLocale } from '~/shared/utils/locale.server'
import { runWithLocale } from '~/shared/utils/locale-scope.server'

const ABORT_DELAY = 5_000

// React Router hands this every error it catches in a loader, an action or a render. Its default
// printed a bare stack; this logs the method, host and path with it (see describeRequestError).
export const handleError: HandleErrorFunction = (error, { request, params }) => {
  const entry = describeRequestError(error, request, params)
  if (entry) logger.error(entry.message, entry.meta)
}

/**
 * The nonce `securityHeaders()` put in this response's CSP header. React Router's streaming scripts
 * (they carry the loader data) and React's inline runtime need it too, or an enforced policy blocks
 * them and the page never hydrates. securityHeaders() sets the nonce and the CSP header together,
 * so a context without a nonce belongs to a response without a policy, and rendering without one
 * blocks nothing.
 */
function documentNonce(loadContext: RouterContextProvider): string | undefined {
  try {
    return loadContext.get(nonceContext)
  } catch {
    return undefined
  }
}

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
  loadContext: RouterContextProvider,
) {
  // requestLocale() has resolved it, unless React Router skipped the middleware: it does for a path
  // no route matches, whose 404 page is then resolved here.
  const fromMiddleware = loadContext.get(documentLocaleContext)
  const resolved = fromMiddleware ?? (await resolveDocumentLocale(request))
  // A subdomain no congregation owns. The sign-in loaders and the session guard send it to
  // /congregation-not-found themselves; this covers the documents that get here without either
  // (public shell pages, unmatched paths).
  if ('redirect' in resolved) return resolved.redirect
  const { locale } = resolved

  // The client's cookie strategy reads PARAGLIDE_LOCALE during hydration, before any JS executes.
  // requestLocale() writes it on the response it returns; only a locale resolved here is written here.
  // A fallback locale is not written: it would replace the one the visitor already has.
  if (!fromMiddleware && resolved.persist) rememberLocale(request, responseHeaders, locale)

  const nonce = documentNonce(loadContext)
  return runWithLocale(locale, () => {
    return isbot(request.headers.get('user-agent') || '')
      ? handleBotRequest(request, responseStatusCode, responseHeaders, reactRouterContext, nonce)
      : handleBrowserRequest(request, responseStatusCode, responseHeaders, reactRouterContext, nonce)
  })
}

function handleBotRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
  nonce: string | undefined,
) {
  return new Promise<Response>((resolve, reject) => {
    let shellRendered = false
    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={reactRouterContext} url={request.url} nonce={nonce} />,
      {
        nonce,
        onAllReady() {
          shellRendered = true
          const body = new PassThrough()
          const stream = createReadableStreamFromReadable(body)

          responseHeaders.set('Content-Type', 'text/html')

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          )

          pipe(body)
        },
        onShellError(error: unknown) {
          reject(error)
        },
        onError(error: unknown) {
          responseStatusCode = 500
          if (shellRendered) {
            logger.error(error)
          }
        },
      },
    )

    setTimeout(abort, ABORT_DELAY)
  })
}

function handleBrowserRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
  nonce: string | undefined,
) {
  return new Promise<Response>((resolve, reject) => {
    let shellRendered = false
    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={reactRouterContext} url={request.url} nonce={nonce} />,
      {
        nonce,
        onShellReady() {
          shellRendered = true
          const body = new PassThrough()
          const stream = createReadableStreamFromReadable(body)

          responseHeaders.set('Content-Type', 'text/html')

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          )

          pipe(body)
        },
        onShellError(error: unknown) {
          reject(error)
        },
        onError(error: unknown) {
          responseStatusCode = 500
          if (shellRendered) {
            logger.error(error)
          }
        },
      },
    )

    setTimeout(abort, ABORT_DELAY)
  })
}
