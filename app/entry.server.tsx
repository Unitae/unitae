import '~/shared/utils/env.server'
import { AsyncLocalStorage } from 'node:async_hooks'
import { PassThrough } from 'node:stream'

import { createReadableStreamFromReadable } from '@react-router/node'
import { isbot } from 'isbot'
import { renderToPipeableStream } from 'react-dom/server'
import type { AppLoadContext, EntryContext } from 'react-router'
import { ServerRouter } from 'react-router'

import { baseLocale, isLocale, type Locale, overwriteGetLocale } from '~/i18n/paraglide/runtime'
import logger from '~/shared/infra/logger.server'
import { resolveLocaleFromRequest } from '~/shared/utils/locale.server'

const ABORT_DELAY = 5_000

const localeStore = new AsyncLocalStorage<Locale>()

overwriteGetLocale(() => {
  return localeStore.getStore() ?? baseLocale
})

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
  _loadContext: AppLoadContext,
) {
  const resolvedLocale = await resolveLocaleFromRequest(request)
  const locale = isLocale(resolvedLocale) ? resolvedLocale : baseLocale

  // Set the PARAGLIDE_LOCALE cookie via HTTP header so the client-side
  // cookie strategy can read it during hydration (before any JS executes)
  responseHeaders.append('Set-Cookie', `PARAGLIDE_LOCALE=${locale}; Path=/; Max-Age=34560000; SameSite=Lax`)

  return localeStore.run(locale, () => {
    return isbot(request.headers.get('user-agent') || '')
      ? handleBotRequest(request, responseStatusCode, responseHeaders, reactRouterContext)
      : handleBrowserRequest(request, responseStatusCode, responseHeaders, reactRouterContext)
  })
}

function handleBotRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
) {
  return new Promise<Response>((resolve, reject) => {
    let shellRendered = false
    const { pipe, abort } = renderToPipeableStream(<ServerRouter context={reactRouterContext} url={request.url} />, {
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
    })

    setTimeout(abort, ABORT_DELAY)
  })
}

function handleBrowserRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
) {
  return new Promise<Response>((resolve, reject) => {
    let shellRendered = false
    const { pipe, abort } = renderToPipeableStream(<ServerRouter context={reactRouterContext} url={request.url} />, {
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
    })

    setTimeout(abort, ABORT_DELAY)
  })
}
