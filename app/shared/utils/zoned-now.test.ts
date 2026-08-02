import { describe, expect, it } from 'vitest'

import { zonedNow } from './zoned-now'

describe('zonedNow', () => {
  it('reads the wall-clock fields of a timezone ahead of UTC', () => {
    // 2026-01-15T12:00Z → 13:00 in Europe/Paris (UTC+1 in winter)
    const d = zonedNow('Europe/Paris', new Date('2026-01-15T12:00:00Z'))
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(0)
    expect(d.getDate()).toBe(15)
    expect(d.getHours()).toBe(13)
  })

  it('reads a timezone behind UTC, rolling the date back', () => {
    // 2026-01-15T02:00Z → 2026-01-14 21:00 in America/New_York (UTC-5)
    const d = zonedNow('America/New_York', new Date('2026-01-15T02:00:00Z'))
    expect(d.getDate()).toBe(14)
    expect(d.getHours()).toBe(21)
  })

  it('reads the midnight hour as 0 (not 24) so the date does not shift', () => {
    // 2026-06-30T22:15Z → 00:15 on 2026-07-01 in Europe/Paris (UTC+2 in summer)
    const d = zonedNow('Europe/Paris', new Date('2026-06-30T22:15:00Z'))
    expect(d.getHours()).toBe(0)
    expect(d.getMonth()).toBe(6) // July
    expect(d.getDate()).toBe(1)
  })

  it('keeps the service-year boundary correct across midnight (Aug 31 → Sept 1)', () => {
    // 2026-08-31T23:30Z → 01:30 on 2026-09-01 in Europe/Paris (UTC+2) — flips the service year
    const d = zonedNow('Europe/Paris', new Date('2026-08-31T23:30:00Z'))
    expect(d.getMonth()).toBe(8) // September
    expect(d.getDate()).toBe(1)
  })
})
