import { describe, expect, it } from 'vitest'
import { PublisherType } from '~/shared/types/publisher-type'
import { buildServiceYearActivityRows } from './service-year-activity-rows'

function report(month: number, year: number, hours: number) {
  return {
    id: year * 100 + month,
    month,
    year,
    hours,
    studies: 0,
    type: PublisherType.Normal,
    isPublisher: true,
    notes: '',
  }
}

describe('buildServiceYearActivityRows', () => {
  it('lays out the twelve months of the requested service year, September first', () => {
    const rows = buildServiceYearActivityRows([], 2024)

    expect(rows.map(row => [row.year, row.month])).toEqual([
      [2024, 8],
      [2024, 9],
      [2024, 10],
      [2024, 11],
      [2025, 0],
      [2025, 1],
      [2025, 2],
      [2025, 3],
      [2025, 4],
      [2025, 5],
      [2025, 6],
      [2025, 7],
    ])
  })

  it('keeps the requested service year when the publisher only reported in its second half', () => {
    // Regression: a publisher who started reporting in May 2025, exported for 2024-2025, used to
    // come out as a blank 2025-2026 sheet because the year was inferred from the earliest report.
    const activities = [report(4, 2025, 10), report(5, 2025, 12), report(6, 2025, 8), report(7, 2025, 9)]

    const rows = buildServiceYearActivityRows(activities, 2024)

    expect(rows[0]).toMatchObject({ year: 2024, month: 8, hours: null, isPublisher: false })
    expect(rows[8]).toMatchObject({ year: 2025, month: 4, hours: 10 })
    expect(rows[11]).toMatchObject({ year: 2025, month: 7, hours: 9 })
  })

  it('ignores reports outside the requested service year', () => {
    const rows = buildServiceYearActivityRows([report(8, 2025, 10), report(7, 2024, 5)], 2024)

    expect(rows.every(row => row.hours == null)).toBe(true)
  })

  it('fills a missing month with an empty, non-reporting row', () => {
    const [september] = buildServiceYearActivityRows([], 2024)

    expect(september).toEqual({
      year: 2024,
      month: 8,
      hours: null,
      isPublisher: false,
      studies: null,
      type: PublisherType.Normal,
      notes: null,
    })
  })
})
