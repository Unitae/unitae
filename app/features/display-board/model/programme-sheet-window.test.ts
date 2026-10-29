import { describe, expect, it } from 'vitest'
import { eventsForSheet, programmeSheetWindow } from './programme-sheet-window'

describe('programmeSheetWindow', () => {
  it('covers this month and the next, from midnight in the congregation’s timezone', () => {
    const window = programmeSheetWindow(new Date('2026-10-29T10:00:00Z'), 'Europe/Paris')

    // October starts in summer time (UTC+2), December in winter time (UTC+1).
    expect(window.start.toISOString()).toBe('2026-09-30T22:00:00.000Z')
    expect(window.end.toISOString()).toBe('2026-11-30T23:00:00.000Z')
  })

  it('rolls over the year in December', () => {
    const window = programmeSheetWindow(new Date('2026-12-15T10:00:00Z'), 'Europe/Paris')

    expect(window.start.toISOString()).toBe('2026-11-30T23:00:00.000Z')
    expect(window.end.toISOString()).toBe('2027-01-31T23:00:00.000Z')
  })

  it('reads the month on the congregation’s clock, not the server’s', () => {
    // 31 October 14:00 UTC is already 1 November in Nouméa (UTC+11).
    const window = programmeSheetWindow(new Date('2026-10-31T14:00:00Z'), 'Pacific/Noumea')

    expect(window.start.toISOString()).toBe('2026-10-31T13:00:00.000Z')
  })
})

describe('eventsForSheet', () => {
  const window = programmeSheetWindow(new Date('2026-10-29T10:00:00Z'), 'Europe/Paris')
  const at = (iso: string) => ({ startDate: new Date(iso) })

  it('keeps the meetings of this month and the next', () => {
    const events = [at('2026-10-04T08:00:00Z'), at('2026-11-30T18:00:00Z'), at('2026-12-02T18:00:00Z')]

    expect(eventsForSheet(events, window, false)).toEqual(events.slice(0, 2))
  })

  it('prints the deep-linked meeting wherever it falls', () => {
    const later = [at('2027-02-10T18:00:00Z')]

    expect(eventsForSheet(later, window, true)).toEqual(later)
  })
})
