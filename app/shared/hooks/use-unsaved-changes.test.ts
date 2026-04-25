import { beforeEach, describe, expect, it, vi } from 'vitest'

let capturedBlockerFn: (args: { currentLocation: { pathname: string }; nextLocation: { pathname: string } }) => boolean
let capturedEffects: Array<() => undefined | (() => void)>
let capturedDeps: unknown[][]
let setIsDirty: ReturnType<typeof vi.fn>
let navigationState: { state: string }

vi.mock('react', () => {
  let stateValue = false
  const mockSetState = vi.fn((val: boolean | ((prev: boolean) => boolean)) => {
    stateValue = typeof val === 'function' ? val(stateValue) : val
  })

  return {
    useState: vi.fn((initial: boolean) => {
      stateValue = initial
      return [stateValue, mockSetState]
    }),
    useEffect: vi.fn((effect: () => undefined | (() => void), deps: unknown[]) => {
      capturedEffects.push(effect)
      capturedDeps.push(deps)
    }),
    useCallback: vi.fn((fn: unknown) => fn),
  }
})

vi.mock('react-router', () => ({
  useBlocker: vi.fn((fn: typeof capturedBlockerFn) => {
    capturedBlockerFn = fn
    return { state: 'unblocked' }
  }),
  useNavigation: vi.fn(() => navigationState),
}))

const { useUnsavedChanges } = await import('./use-unsaved-changes')
const { useState } = await import('react')

function loc(pathname: string) {
  return { pathname }
}

function simulateHook(dirty: boolean, navState = 'idle') {
  capturedEffects = []
  capturedDeps = []
  navigationState = { state: navState }

  setIsDirty = vi.fn((_val: boolean | ((prev: boolean) => boolean)) => {})

  vi.mocked(useState).mockReturnValue([dirty, setIsDirty] as never)

  // biome-ignore lint/correctness/useHookAtTopLevel: test helper — all React hooks are mocked
  return useUnsavedChanges()
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useUnsavedChanges', () => {
  describe('blocker function', () => {
    it('blocks navigation to a different pathname when dirty', () => {
      simulateHook(true)
      const blocked = capturedBlockerFn({
        currentLocation: loc('/publishers/1/edit'),
        nextLocation: loc('/publishers'),
      })
      expect(blocked).toBe(true)
    })

    it('allows navigation to the same pathname when dirty (form submission)', () => {
      simulateHook(true)
      const blocked = capturedBlockerFn({
        currentLocation: loc('/publishers/1/edit'),
        nextLocation: loc('/publishers/1/edit'),
      })
      expect(blocked).toBe(false)
    })

    it('allows navigation to a different pathname when not dirty', () => {
      simulateHook(false)
      const blocked = capturedBlockerFn({
        currentLocation: loc('/publishers/1/edit'),
        nextLocation: loc('/publishers'),
      })
      expect(blocked).toBe(false)
    })

    it('allows navigation to the same pathname when not dirty', () => {
      simulateHook(false)
      const blocked = capturedBlockerFn({
        currentLocation: loc('/publishers/1/edit'),
        nextLocation: loc('/publishers/1/edit'),
      })
      expect(blocked).toBe(false)
    })
  })

  describe('markDirty', () => {
    it('returns a markDirty callback', () => {
      const { markDirty } = simulateHook(false)
      expect(typeof markDirty).toBe('function')
    })
  })

  describe('dirty state reset on form submission', () => {
    it('resets dirty state when navigation.state is submitting', () => {
      simulateHook(true, 'submitting')

      const submittingEffect = capturedEffects[0]
      submittingEffect()

      expect(setIsDirty).toHaveBeenCalledWith(false)
    })

    it('does not reset dirty state when navigation.state is idle', () => {
      simulateHook(true, 'idle')

      const submittingEffect = capturedEffects[0]
      submittingEffect()

      expect(setIsDirty).not.toHaveBeenCalled()
    })

    it('does not reset dirty state when navigation.state is loading', () => {
      simulateHook(true, 'loading')

      const submittingEffect = capturedEffects[0]
      submittingEffect()

      expect(setIsDirty).not.toHaveBeenCalled()
    })
  })

  describe('beforeunload effect', () => {
    beforeEach(() => {
      // @ts-expect-error — minimal window mock for Node environment
      globalThis.window = { addEventListener: vi.fn(), removeEventListener: vi.fn() }
    })

    it('returns a cleanup function when dirty', () => {
      simulateHook(true)

      const beforeUnloadEffect = capturedEffects[1]
      const cleanup = beforeUnloadEffect()

      expect(typeof cleanup).toBe('function')
    })

    it('calls addEventListener on window when dirty', () => {
      simulateHook(true)

      const beforeUnloadEffect = capturedEffects[1]
      beforeUnloadEffect()

      expect(window.addEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function))
    })

    it('calls removeEventListener on cleanup', () => {
      simulateHook(true)

      const beforeUnloadEffect = capturedEffects[1]
      const cleanup = beforeUnloadEffect() as () => void
      cleanup()

      expect(window.removeEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function))
    })

    it('returns undefined when not dirty (no listener registered)', () => {
      simulateHook(false)

      const beforeUnloadEffect = capturedEffects[1]
      const result = beforeUnloadEffect()

      expect(result).toBeUndefined()
    })

    it('depends on isDirty state', () => {
      simulateHook(true)

      const beforeUnloadDeps = capturedDeps[1]
      expect(beforeUnloadDeps).toEqual([true])
    })

    it('depends on isDirty=false when not dirty', () => {
      simulateHook(false)

      const beforeUnloadDeps = capturedDeps[1]
      expect(beforeUnloadDeps).toEqual([false])
    })
  })

  describe('return value', () => {
    it('returns blocker and markDirty', () => {
      const result = simulateHook(false)
      expect(result).toHaveProperty('blocker')
      expect(result).toHaveProperty('markDirty')
    })
  })
})
