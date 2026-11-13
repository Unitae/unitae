import { describe, expect, it, vi } from 'vitest'

vi.mock('~/i18n/paraglide/runtime', async importOriginal => ({
  ...(await importOriginal<object>()),
  getLocale: () => 'fr',
}))

const { dueLabel, loanDay, territoryEntrancesLabel } = await import('./my-territory-labels')

// Instants are built in UTC and read in the congregation's zone, so the runner's zone never leaks in.
const PARIS = 'Europe/Paris'
// Prefixes only: the year joins the date once the tests run in another year.
const DUE_ON = /^À rendre le 23 novembre/
const LATE_SINCE = /^En retard depuis le 3 sept\./

describe('loanDay', () => {
  const now = new Date(Date.UTC(2026, 10, 9, 12))

  it('reads the day in the congregation zone', () => {
    // 23:30 UTC on the 22nd is already the 23rd in Paris.
    expect(loanDay(new Date(Date.UTC(2026, 10, 22, 23, 30)), PARIS, 'short', now)).toBe('23 nov.')
  })

  it('adds the year for another year than the current one', () => {
    expect(loanDay(new Date(Date.UTC(2025, 8, 3, 10)), PARIS, 'short', now)).toBe('3 sept. 2025')
  })
})

describe('dueLabel', () => {
  it('says when to bring the territory back', () => {
    expect(dueLabel('due-soon', new Date(Date.UTC(2026, 10, 23, 10)), PARIS, 'long')).toMatch(DUE_ON)
  })

  it('says since when it is late', () => {
    expect(dueLabel('overdue', new Date(Date.UTC(2026, 8, 3, 10)), PARIS)).toMatch(LATE_SINCE)
  })
})

describe('territoryEntrancesLabel', () => {
  it('counts the entrances of a door-to-door territory, in the singular for one', () => {
    expect(territoryEntrancesLabel('Classical', 5)).toBe('5 entrées')
    expect(territoryEntrancesLabel('Classical', 1)).toBe('1 entrée')
  })

  it('says nothing when the count already is the entrances, or when there are none', () => {
    expect(territoryEntrancesLabel('Commerces', 5)).toBeNull()
    expect(territoryEntrancesLabel('Phone', 5)).toBeNull()
    expect(territoryEntrancesLabel('Classical', 0)).toBeNull()
  })
})
