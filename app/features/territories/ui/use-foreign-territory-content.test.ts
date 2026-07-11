import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import type { TerritoryContent } from '~/features/territories/server/territory-content.queries'

let capturedEffect: (() => undefined | (() => void)) | null = null
let capturedDeps: unknown[] | null = null
let stateHistory: unknown[]

vi.mock('react', () => {
  return {
    useState: vi.fn(<T>(initial: T) => {
      stateHistory = [initial]
      return [initial, (next: T | ((prev: T) => T)) => stateHistory.push(next)]
    }),
    useEffect: vi.fn((effect: () => undefined | (() => void), deps: unknown[]) => {
      capturedEffect = effect
      capturedDeps = deps
    }),
  }
})

const { useForeignTerritoryContent } = await import('./EntrancePopup')

const okContent: TerritoryContent = {
  id: 7,
  number: 'T7',
  kind: TerritoryKind.Classical,
  entranceCount: 3,
  quantity: 5,
  homes: 5,
  phones: 0,
  liberals: 0,
}

function mockFetch(impl: (input: string, init?: { signal?: AbortSignal }) => Promise<Response>) {
  globalThis.fetch = vi.fn(impl as never) as never
}

async function flushMicrotasks(times = 3) {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

beforeEach(() => {
  stateHistory = []
  capturedEffect = null
  capturedDeps = null
})

describe('useForeignTerritoryContent', () => {
  it('stays idle when territoryId is null', () => {
    useForeignTerritoryContent(null)
    expect(stateHistory).toEqual([{ status: 'idle' }])
    capturedEffect?.()
    expect(stateHistory).toEqual([{ status: 'idle' }, { status: 'idle' }])
  })

  it('re-runs the effect when territoryId changes', () => {
    useForeignTerritoryContent(42)
    expect(capturedDeps).toEqual([42])
  })

  it('transitions loading → ready when the endpoint returns a valid payload', async () => {
    mockFetch(async () => new Response(JSON.stringify(okContent), { status: 200 }))
    useForeignTerritoryContent(7)
    capturedEffect?.()
    await flushMicrotasks()
    expect(stateHistory.at(-1)).toEqual({ status: 'ready', content: okContent })
  })

  it('transitions loading → error(not-found) on HTTP 404', async () => {
    mockFetch(async () => new Response(JSON.stringify({ error: 'territory_not_found' }), { status: 404 }))
    useForeignTerritoryContent(7)
    capturedEffect?.()
    await flushMicrotasks()
    expect(stateHistory.at(-1)).toEqual({ status: 'error', reason: 'not-found' })
  })

  it('transitions loading → error(server) on HTTP 500', async () => {
    mockFetch(async () => new Response('boom', { status: 500 }))
    useForeignTerritoryContent(7)
    capturedEffect?.()
    await flushMicrotasks()
    expect(stateHistory.at(-1)).toEqual({ status: 'error', reason: 'server' })
  })

  it('transitions loading → error(unexpected) when the payload does not match the schema', async () => {
    mockFetch(async () => new Response(JSON.stringify({ id: 'not-a-number' }), { status: 200 }))
    useForeignTerritoryContent(7)
    capturedEffect?.()
    await flushMicrotasks()
    expect(stateHistory.at(-1)).toEqual({ status: 'error', reason: 'unexpected' })
  })

  it('transitions loading → error(network) when fetch rejects and the request was not aborted', async () => {
    mockFetch(() => Promise.reject(new Error('network fail')))
    useForeignTerritoryContent(7)
    capturedEffect?.()
    await flushMicrotasks()
    expect(stateHistory.at(-1)).toEqual({ status: 'error', reason: 'network' })
  })

  it('swallows aborted fetches instead of transitioning to error', async () => {
    mockFetch((_url, init) => {
      init?.signal?.dispatchEvent?.(new Event('abort'))
      const err = new Error('aborted')
      err.name = 'AbortError'
      return Promise.reject(err)
    })
    useForeignTerritoryContent(7)
    const cleanup = capturedEffect?.()
    cleanup?.()
    await flushMicrotasks()
    // The last state pushed should be the initial 'loading', not any 'error' entry.
    expect(stateHistory.some(s => (s as { status?: string }).status === 'error')).toBe(false)
  })
})
