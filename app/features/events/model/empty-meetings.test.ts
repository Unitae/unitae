import { describe, expect, it } from 'vitest'
import { dayInSameWeek, isAwaitingProgramme } from './empty-meetings'

describe('dayInSameWeek', () => {
  // Weeks run Monday to Sunday: a weekend meeting moved from Saturday to Sunday stays in its week.
  it('moves Saturday to the Sunday after it, never the one before', () => {
    expect(dayInSameWeek('2026-11-21', 0)).toBe('2026-11-22')
  })

  it('moves Sunday to the Saturday before it', () => {
    expect(dayInSameWeek('2026-11-22', 6)).toBe('2026-11-21')
  })

  it('moves Tuesday to the Thursday of the same week, and keeps a day already right', () => {
    expect(dayInSameWeek('2026-11-17', 4)).toBe('2026-11-19')
    expect(dayInSameWeek('2026-11-19', 4)).toBe('2026-11-19')
  })

  it('moves Thursday back to the Monday of its week', () => {
    expect(dayInSameWeek('2026-11-19', 1)).toBe('2026-11-16')
  })
})

describe('isAwaitingProgramme', () => {
  const midweek = { key: 'midweek-meeting' }

  it('is a meeting of a template with neither parts nor services yet', () => {
    expect(isAwaitingProgramme({ parts: 0, services: 0, template: midweek })).toBe(true)
    // A template the congregation made itself has no key.
    expect(isAwaitingProgramme({ parts: 0, services: 0, template: { key: null } })).toBe(true)
  })

  it('is not a meeting with a part or a service', () => {
    expect(isAwaitingProgramme({ parts: 1, services: 0, template: midweek })).toBe(false)
    expect(isAwaitingProgramme({ parts: 0, services: 2, template: midweek })).toBe(false)
  })

  // « Autre évènement » has no programme to wait for: empty, it is still an event that can be published.
  it('is never another event, nor an absence', () => {
    expect(isAwaitingProgramme({ parts: 0, services: 0, template: { key: 'freeform' } })).toBe(false)
    expect(isAwaitingProgramme({ parts: 0, services: 0, template: { key: 'day-off' } })).toBe(false)
  })

  it('is not an event without a template', () => {
    expect(isAwaitingProgramme({ parts: 0, services: 0, template: null })).toBe(false)
  })
})
