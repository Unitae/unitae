import { describe, expect, it, vi } from 'vitest'

vi.mock('~/i18n/paraglide/runtime', async importOriginal => ({
  ...(await importOriginal<object>()),
  getLocale: () => 'fr',
}))

const { absenceDays, absenceLength, absenceWindow, conflictWarning, formatAbsencePeriod } = await import('./absence')

const PARIS = 'Europe/Paris'
const NOW = new Date('2026-11-09T12:00:00Z')

describe('absenceWindow', () => {
  it('covers whole days in the congregation zone, the last one until its very end', () => {
    const { startDate, endDate } = absenceWindow({ first: '2026-11-10', last: '2026-11-13' }, PARIS)

    expect(startDate.toISOString()).toBe('2026-11-09T23:00:00.000Z')
    expect(endDate.toISOString()).toBe('2026-11-13T22:59:59.999Z')
  })

  it('covers a single day from its morning to its evening', () => {
    const { startDate, endDate } = absenceWindow({ first: '2026-11-28', last: '2026-11-28' }, PARIS)

    // A meeting at 19:00 that evening falls inside it.
    const meeting = new Date('2026-11-28T18:00:00Z')
    expect(startDate <= meeting && meeting <= endDate).toBe(true)
  })
})

describe('absenceDays', () => {
  it('counts the days an absence covers, both ends included', () => {
    const { startDate, endDate } = absenceWindow({ first: '2026-12-21', last: '2027-01-03' }, PARIS)

    expect(absenceDays(startDate, endDate, PARIS)).toEqual({ first: '2026-12-21', last: '2027-01-03', count: 14 })
  })

  it('reads an absence saved at midnight UTC on the days it was declared for', () => {
    const days = absenceDays(new Date('2026-08-27T00:00:00Z'), new Date('2026-08-30T00:00:00Z'), PARIS)

    expect(days).toEqual({ first: '2026-08-27', last: '2026-08-30', count: 4 })
  })
})

describe('formatAbsencePeriod', () => {
  it('names a period inside one month once', () => {
    const { startDate, endDate } = absenceWindow({ first: '2026-11-10', last: '2026-11-13' }, PARIS)

    // Plain spaces only, whatever ICU the server and the browser run.
    expect(formatAbsencePeriod(startDate, endDate, PARIS, NOW)).toBe('mar. 10 – ven. 13 novembre')
  })

  it('names a single day alone', () => {
    const { startDate, endDate } = absenceWindow({ first: '2026-11-28', last: '2026-11-28' }, PARIS)

    expect(formatAbsencePeriod(startDate, endDate, PARIS, NOW)).toBe('sam. 28 novembre')
  })

  it('adds the years when the period runs into another year', () => {
    const { startDate, endDate } = absenceWindow({ first: '2026-12-21', last: '2027-01-03' }, PARIS)

    expect(formatAbsencePeriod(startDate, endDate, PARIS, NOW)).toBe('lun. 21 décembre 2026 – dim. 3 janvier 2027')
  })
})

describe('absenceLength', () => {
  it('says one day or several', () => {
    expect(absenceLength(1)).toBe('1 jour')
    expect(absenceLength(4)).toBe('4 jours')
  })
})

describe('conflictWarning', () => {
  it('says when the assignment falls, in the congregation zone, and whom to warn', () => {
    expect(conflictWarning({ eventDate: '2026-12-26T23:30:00Z', responsibleName: 'Paul Roux' }, PARIS)).toBe(
      'dim. 27 déc. · prévenir Paul Roux',
    )
  })

  it('falls back on the person in charge of the programme', () => {
    expect(conflictWarning({ eventDate: '2026-12-27T09:00:00Z', responsibleName: null }, PARIS)).toBe(
      'dim. 27 déc. · prévenir le responsable du programme',
    )
  })
})
