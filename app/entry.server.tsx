import '~/shared/libs/env.server'
import { PassThrough } from 'node:stream'

import { createReadableStreamFromReadable } from '@react-router/node'
import { isbot } from 'isbot'
import { renderToPipeableStream } from 'react-dom/server'
import type { AppLoadContext, EntryContext } from 'react-router'
import { ServerRouter } from 'react-router'

import { defineCustomServerStrategy } from '~/paraglide/runtime'
import { paraglideMiddleware } from '~/paraglide/server'
import { resolveLocaleFromRequest } from '~/shared/libs/locale.server'
import logger from '~/shared/libs/logger.server'

const ABORT_DELAY = 5_000

defineCustomServerStrategy('custom-congregation', {
  getLocale: (request?: Request) => {
    if (!request) return undefined
    return resolveLocaleFromRequest(request)
  },
})

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
  _loadContext: AppLoadContext,
) {
  return paraglideMiddleware(request, ({ request: localizedRequest }) => {
    return isbot(request.headers.get('user-agent') || '')
      ? handleBotRequest(localizedRequest, responseStatusCode, responseHeaders, reactRouterContext)
      : handleBrowserRequest(localizedRequest, responseStatusCode, responseHeaders, reactRouterContext)
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
