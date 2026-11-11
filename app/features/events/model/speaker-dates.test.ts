import { describe, expect, it } from 'vitest'
import { visitAgo } from './speaker-dates'

const NOW = new Date('2026-11-11T12:00:00Z')

describe('visitAgo', () => {
  it('speaks in months under a year and in years beyond, never in 30-day months off by one', () => {
    const months = visitAgo(new Date('2026-03-08T10:00:00Z'), NOW)
    const years = visitAgo(new Date('2024-09-01T10:00:00Z'), NOW)
    expect(months).toContain('8')
    expect(years).toContain('2')
    expect(months).not.toBe(years)
  })

  it('says something sensible for a visit this week', () => {
    expect(visitAgo(new Date('2026-11-09T10:00:00Z'), NOW)).not.toBe('')
  })
})
