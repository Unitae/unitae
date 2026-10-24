import { createStaticHandler, RouterContextProvider, redirect } from 'react-router'
import { describe, expect, it } from 'vitest'

// The premise layout gates rely on: a parent route's *middleware* runs before a child route's action,
// while a parent's *loader* does not. React Router's server runtime handles a document POST and a
// single-fetch (`.data`) action through `staticHandler.query()` with `generateMiddlewareResponse`
// (the latter with `skipRevalidation`), so both are exercised here against the installed version.

function buildHandler(writes: string[]) {
  return createStaticHandler([
    {
      id: 'layout',
      path: '/area',
      middleware: [
        ({ request }) => {
          if (request.headers.get('x-allowed') !== 'yes') throw redirect('/')
        },
      ],
      loader: () => null,
      children: [{ id: 'leaf', path: 'thing', action: () => (writes.push('written'), null), loader: () => null }],
    },
  ])
}

async function submit(allowed: boolean, skipRevalidation: boolean) {
  const writes: string[] = []
  const request = new Request('https://unitae.example.test/area/thing', {
    method: 'POST',
    body: new URLSearchParams({ a: '1' }),
    headers: { 'x-allowed': allowed ? 'yes' : 'no' },
  })
  const response = await buildHandler(writes).query(request, {
    requestContext: new RouterContextProvider(),
    skipRevalidation,
    generateMiddlewareResponse: async query => {
      const result = await query(request)
      return result instanceof Response ? result : new Response(null, { status: 200 })
    },
  })
  return { response: response as Response, writes }
}

describe('layout middleware and child actions', () => {
  it('a gate in the parent loader does not stop the child action', async () => {
    const writes: string[] = []
    const handler = createStaticHandler([
      {
        id: 'layout',
        path: '/area',
        loader: () => {
          throw redirect('/')
        },
        children: [{ id: 'leaf', path: 'thing', action: () => (writes.push('written'), null) }],
      },
    ])
    const request = new Request('https://unitae.example.test/area/thing', {
      method: 'POST',
      body: new URLSearchParams({ a: '1' }),
    })
    await handler.query(request, { skipRevalidation: true })

    expect(writes).toEqual(['written'])
  })

  for (const [mode, skipRevalidation] of [
    ['document POST', false],
    ['single-fetch action', true],
  ] as const) {
    it(`runs the parent middleware before the child action (${mode})`, async () => {
      const refused = await submit(false, skipRevalidation)
      expect(refused.response.status).toBe(302)
      expect(refused.response.headers.get('Location')).toBe('/')
      expect(refused.writes).toEqual([])

      const allowed = await submit(true, skipRevalidation)
      expect(allowed.writes).toEqual(['written'])
    })
  }
})
