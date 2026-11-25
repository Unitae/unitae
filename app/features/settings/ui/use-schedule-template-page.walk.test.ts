import { beforeEach, describe, expect, it, vi } from 'vitest'

// React and the router stood in for: one render, its setters recorded.
const { router, pending } = vi.hoisted(() => ({
  router: {
    search: '',
    state: { level: 'item' } as unknown,
    setParams: [] as [(prev: URLSearchParams) => URLSearchParams, Record<string, unknown>][],
  },
  pending: { current: null as null | (() => void) },
}))
vi.mock('react', () => ({
  useRef: (initial: unknown) => ({ current: initial }),
  useEffect: () => undefined,
  useState: (initial: unknown) => [
    initial,
    (next: unknown) => {
      // The guard's pending action, stored as a function returning it.
      if (typeof next === 'function') pending.current = (next as () => () => void)()
    },
  ],
}))
vi.mock('react-router', () => ({
  useSearchParams: () => [
    new URLSearchParams(router.search),
    (fn: (prev: URLSearchParams) => URLSearchParams, options: Record<string, unknown>) =>
      router.setParams.push([fn, options]),
  ],
  useLocation: () => ({ key: 'k', state: router.state }),
  useNavigate: () => vi.fn(),
  useBlocker: () => ({ state: 'unblocked', reset: vi.fn(), proceed: vi.fn() }),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

const { useScheduleTemplatePage } = await import('./use-schedule-template-page')

const page = (dirty: boolean) => useScheduleTemplatePage({ templateIds: [3], itemExists: () => true, dirty })

beforeEach(() => {
  router.search = 'template=3&item=part-12'
  router.setParams.length = 0
  pending.current = null
})

describe('walkItem', () => {
  it('replaces the part open, keeping the history entry’s state, so « ← » still lands on the list', () => {
    page(false).walkItem({ kind: 'part', id: 13 })
    const [[fn, options] = []] = router.setParams
    expect(options).toMatchObject({ replace: true, state: { level: 'item' } })
    expect(fn?.(new URLSearchParams(router.search)).toString()).toBe('template=3&item=part-13')
  })

  it('drops a new part’s draft from the address', () => {
    router.search = 'template=3&item=new-part&section=Joyaux&hall=&order=4'
    page(false).walkItem({ kind: 'part', id: 13 })
    const [[fn] = []] = router.setParams
    expect(fn?.(new URLSearchParams(router.search)).toString()).toBe('template=3&item=part-13')
  })

  it('asks first while the part holds unsaved changes', () => {
    page(true).walkItem({ kind: 'part', id: 13 })
    expect(router.setParams).toEqual([])
    pending.current?.()
    expect(router.setParams).toHaveLength(1)
  })
})
