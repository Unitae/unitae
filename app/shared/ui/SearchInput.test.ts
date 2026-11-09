import { beforeEach, describe, expect, it, vi } from 'vitest'

// Regression: clearing the search from outside the field (an empty list's « Effacer la recherche ») did nothing. The
// address changed, so the field's effect ran again with the text still typed and wrote it straight back.

const hooks = vi.hoisted(() => ({
  effects: [] as Array<() => void>,
  refs: [] as Array<{ current: unknown }>,
  refIndex: 0,
  value: '',
  debounced: '',
  params: new URLSearchParams(),
  setSearchParams: (() => undefined) as (update: (prev: URLSearchParams) => URLSearchParams) => void,
}))

vi.mock('react', () => ({
  useState: (initial: string) => {
    hooks.value = hooks.value || initial
    return [hooks.value, (next: string) => (hooks.value = next)]
  },
  useEffect: (effect: () => void) => hooks.effects.push(effect),
  // One ref per call, kept from one render to the next.
  useRef: (initial: unknown) => {
    const index = hooks.refIndex++
    hooks.refs[index] ??= { current: initial }
    return hooks.refs[index]
  },
}))

vi.mock('react-router', () => ({
  useSearchParams: () => [hooks.params, hooks.setSearchParams],
  useNavigation: () => ({ state: 'idle' }),
}))

vi.mock('~/shared/ui/hooks/use-debounced-value', () => ({ useDebouncedValue: () => hooks.debounced }))

const { SearchInput } = await import('./SearchInput')

/** Renders the field once and runs its effects, as React would after the render. */
function render() {
  hooks.effects = []
  hooks.refIndex = 0
  SearchInput({ paramName: 'q' })
  for (const effect of hooks.effects) effect()
}

let written: string[]

beforeEach(() => {
  hooks.refs = []
  written = []
  hooks.setSearchParams = update => {
    hooks.params = update(new URLSearchParams(hooks.params))
    written.push(hooks.params.toString())
  }
})

describe('SearchInput', () => {
  it('leaves a search cleared from outside the field cleared', () => {
    hooks.params = new URLSearchParams('q=zz')
    hooks.value = 'zz'
    hooks.debounced = 'zz'
    render()

    // Something else drops `q`: a new address, and with it a new setSearchParams.
    hooks.params = new URLSearchParams('view=review')
    hooks.setSearchParams = update => {
      hooks.params = update(new URLSearchParams(hooks.params))
      written.push(hooks.params.toString())
    }
    render()

    expect(written).not.toContain('view=review&q=zz')
    expect(hooks.params.get('q')).toBeNull()
  })

  it('writes what was typed once it settles', () => {
    hooks.params = new URLSearchParams()
    hooks.value = ''
    hooks.debounced = ''
    render()

    hooks.value = 'mar'
    hooks.debounced = 'mar'
    render()

    expect(hooks.params.get('q')).toBe('mar')
  })
})
