import { describe, expect, it } from 'vitest'
import { getWorkerTimezone, runInWorkerContext } from './worker-locale.server'

describe('runInWorkerContext', () => {
  it('exposes the timezone inside the callback', async () => {
    let seen: string | undefined
    await runInWorkerContext('fr', 'Europe/Berlin', () => {
      seen = getWorkerTimezone()
    })
    expect(seen).toBe('Europe/Berlin')
  })

  it('nests: an inner context overrides the outer timezone until it returns', async () => {
    let outer: string | undefined
    let inner: string | undefined
    let outerAgain: string | undefined
    await runInWorkerContext('fr', 'Europe/Paris', async () => {
      outer = getWorkerTimezone()
      await runInWorkerContext('en', 'America/New_York', () => {
        inner = getWorkerTimezone()
      })
      outerAgain = getWorkerTimezone()
    })
    expect(outer).toBe('Europe/Paris')
    expect(inner).toBe('America/New_York')
    expect(outerAgain).toBe('Europe/Paris')
  })

  it('outside any context, getWorkerTimezone returns undefined', () => {
    expect(getWorkerTimezone()).toBeUndefined()
  })

  it('propagates the return value of the callback', async () => {
    const result = await runInWorkerContext('fr', 'Europe/Paris', async () => 42)
    expect(result).toBe(42)
  })

  it('applies the timezone in Intl date formatting when read via `getWorkerTimezone`', async () => {
    // Same instant, different TZ → different local hour.
    const instant = new Date('2026-06-15T12:00:00Z')
    let parisTime: string | undefined
    let nyTime: string | undefined
    await runInWorkerContext('fr', 'Europe/Paris', () => {
      parisTime = new Intl.DateTimeFormat('fr', { timeZone: getWorkerTimezone(), hour: '2-digit' }).format(instant)
    })
    await runInWorkerContext('fr', 'America/New_York', () => {
      nyTime = new Intl.DateTimeFormat('fr', { timeZone: getWorkerTimezone(), hour: '2-digit' }).format(instant)
    })
    expect(parisTime).not.toBe(nyTime)
  })
})
