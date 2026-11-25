import { beforeEach, describe, expect, it, vi } from 'vitest'

// React stood in for: refs persist across renders of one test, effects run as soon as declared.
const { refs } = vi.hoisted(() => ({ refs: [] as { current: unknown }[] }))
let index = 0
vi.mock('react', () => ({
  useRef: (initial: unknown) => {
    refs[index] ??= { current: initial }
    return refs[index++]
  },
  useEffect: (run: () => void) => run(),
}))

const { useOnSettled } = await import('./use-on-settled')

type State = 'idle' | 'submitting' | 'loading'
const render = (state: State, data: unknown, onSettled: () => void) => {
  index = 0
  useOnSettled({ state, data } as never, onSettled)
}

beforeEach(() => {
  refs.length = 0
})

describe('useOnSettled', () => {
  it('runs once a new answer is in, ok, even when the submitting render never happened', () => {
    const settled = vi.fn()
    const answer = { ok: true }
    render('idle', undefined, settled)
    render('loading', undefined, settled)
    render('idle', answer, settled)
    // The same answer on the next render (the router keeps it): not a second save.
    render('idle', answer, settled)
    expect(settled).toHaveBeenCalledTimes(1)
  })

  it('runs again for the next answer, and never for a refusal or an answer there on mount', () => {
    const settled = vi.fn()
    const stale = { ok: true }
    render('idle', stale, settled)
    render('idle', { ok: false }, settled)
    render('idle', { ok: true }, settled)
    render('submitting', { ok: true }, settled)
    render('idle', { ok: true }, settled)
    expect(settled).toHaveBeenCalledTimes(2)
  })
})
