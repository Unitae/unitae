import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readThemeChoice, writeThemeChoice } from './use-theme'

const store = new Map<string, string>()
const classes = new Set<string>()
let prefersDark = false

beforeEach(() => {
  store.clear()
  classes.clear()
  prefersDark = false
  Object.assign(globalThis, {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    },
    window: { matchMedia: () => ({ matches: prefersDark }) },
    document: {
      documentElement: {
        classList: { toggle: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name)) },
      },
    },
  })
})

afterEach(() => {
  for (const key of ['localStorage', 'window', 'document']) Reflect.deleteProperty(globalThis, key)
})

describe('theme choice', () => {
  it('is « Système » when nothing was chosen, which is what the boot script assumes too', () => {
    expect(readThemeChoice()).toBe('system')
  })

  it('remembers light or dark and applies it', () => {
    writeThemeChoice('dark')
    expect(readThemeChoice()).toBe('dark')
    expect(classes.has('dark')).toBe(true)

    writeThemeChoice('light')
    expect(readThemeChoice()).toBe('light')
    expect(classes.has('dark')).toBe(false)
  })

  it('forgets the choice for « Système » and follows the device', () => {
    writeThemeChoice('light')
    prefersDark = true
    writeThemeChoice('system')
    expect(store.has('theme')).toBe(false)
    expect(classes.has('dark')).toBe(true)
  })

  it('treats an unknown stored value as « Système »', () => {
    store.set('theme', 'sepia')
    expect(readThemeChoice()).toBe('system')
  })
})
