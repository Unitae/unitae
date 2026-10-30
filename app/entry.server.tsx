import '~/shared/infra/boot.server'
import '~/shared/infra/graceful-exit.server'
import { AsyncLocalStorage } from 'node:async_hooks'
import { PassThrough } from 'node:stream'

import { createReadableStreamFromReadable } from '@react-router/node'
import { isbot } from 'isbot'
import { renderToPipeableStream } from 'react-dom/server'
import type { EntryContext, HandleErrorFunction, RouterContextProvider } from 'react-router'
import { ServerRouter } from 'react-router'

import { baseLocale, type Locale, overwriteGetLocale } from '~/i18n/paraglide/runtime'
import logger from '~/shared/infra/logger.server'
import { describeRequestError } from '~/shared/infra/request-error.server'
import { nonceContext } from '~/shared/middleware/security-headers.server'
import { resolveDocumentLocale } from '~/shared/utils/locale.server'

const ABORT_DELAY = 5_000

const localeStore = new AsyncLocalStorage<Locale>()

overwriteGetLocale(() => {
  return localeStore.getStore() ?? baseLocale
})

// React Router hands this every error it catches in a loader, an action or a render. Its default
// printed a bare stack; this logs the method, host and path with it (see describeRequestError).
export const handleError: HandleErrorFunction = (error, { request, params }) => {
  const entry = describeRequestError(error, request, params)
  if (entry) logger.error(entry.message, entry.meta)
}

/**
 * The nonce `securityHeaders()` put in this response's CSP header. React Router's streaming scripts
 * (they carry the loader data) and React's inline runtime need it too, or an enforced policy blocks
 * them and the page never hydrates. A context without one renders as before, without a nonce; the
 * CSP report then names the scripts it would block.
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
  const resolved = await resolveDocumentLocale(request)
  // A subdomain no congregation owns. The sign-in loaders and the session guard send it to
  // /congregation-not-found themselves; this covers the documents that get here without either
  // (public shell pages, unmatched paths).
  if ('redirect' in resolved) return resolved.redirect
  const { locale } = resolved

  // Set the PARAGLIDE_LOCALE cookie via HTTP header so the client-side
  // cookie strategy can read it during hydration (before any JS executes).
  // A fallback locale is not written: it would replace the one the visitor already has.
  if (resolved.persist) {
    responseHeaders.append('Set-Cookie', `PARAGLIDE_LOCALE=${locale}; Path=/; Max-Age=34560000; SameSite=Lax`)
  }

  const nonce = documentNonce(loadContext)
  return localeStore.run(locale, () => {
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
