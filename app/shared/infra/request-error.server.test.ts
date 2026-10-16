import { UNSAFE_ErrorResponseImpl as ErrorResponseImpl } from 'react-router'
import { describe, expect, it } from 'vitest'

import { describeRequestError } from './request-error.server'

function request(url: string, init: RequestInit = {}) {
  return new Request(url, init)
}

describe('describeRequestError', () => {
  // Regression: an error thrown in an action left only a bare stack in the logs, with no route,
  // host or method to tell which congregation or which action it came from.
  it('names the method, host and path the error happened on', () => {
    const error = new Error('storage unavailable')

    expect(
      describeRequestError(error, request('https://lyon.unitae.app/board/documents/new?x=1', { method: 'POST' })),
    ).toEqual({
      message: 'Request failed: POST /board/documents/new',
      meta: { error, method: 'POST', host: 'lyon.unitae.app', path: '/board/documents/new' },
    })
  })

  // The calendar feed and email verification carry their secret in the path; a log line must not.
  it('redacts a secret route parameter from the path', () => {
    const entry = describeRequestError(
      new Error('boom'),
      request('https://lyon.unitae.app/feed/s3cr3t-t0k3n/calendar.ics'),
      {
        token: 's3cr3t-t0k3n',
      },
    )

    expect(entry?.message).toBe('Request failed: GET /feed/[redacted]/calendar.ics')
    expect(entry?.meta.path).toBe('/feed/[redacted]/calendar.ics')
  })

  it('keeps an ordinary route parameter', () => {
    const entry = describeRequestError(new Error('boom'), request('https://lyon.unitae.app/publishers/42/view'), {
      publisherId: '42',
    })

    expect(entry?.meta.path).toBe('/publishers/42/view')
  })

  it('logs nothing for a request the visitor abandoned', () => {
    const controller = new AbortController()
    controller.abort()

    expect(
      describeRequestError(new Error('aborted'), request('https://unitae.app/', { signal: controller.signal })),
    ).toBeNull()
  })

  // A 404 or a 405 is an answer, not a failure: it must not read as an error in the logs.
  it('logs nothing for a client error React Router answered itself', () => {
    const notFound = new ErrorResponseImpl(404, 'Not Found', new Error('No route matches URL "/nope"'), true)

    expect(describeRequestError(notFound, request('https://unitae.app/nope'))).toBeNull()
  })

  it('logs the underlying error of a server error response', () => {
    const cause = new Error('boom')
    const response = new ErrorResponseImpl(500, 'Internal Server Error', cause, true)

    expect(describeRequestError(response, request('https://unitae.app/x'))?.meta.error).toBe(cause)
  })
})
