import { describe, expect, it } from 'vitest'

import { paceColumns, paceTotals } from './pioneer-chart-data'
import { computePioneerPace, type PioneerMonth } from './pioneer-pace'

const SY = 2025
const month = (m: number, y: number, hours: number, credit = 0): PioneerMonth => ({ month: m, year: y, hours, credit })

// Enrolled from November; December filed with 6 h of credit, January missed; mid-March.
const pace = computePioneerPace({
  serviceYear: SY,
  monthlyRate: 50,
  months: [month(10, 2025, 40), month(11, 2025, 36, 6), month(1, 2026, 44)],
  now: new Date(2026, 2, 15),
  enrolledFrom: { month: 10, year: 2025 },
})

describe('paceColumns', () => {
  it('gives each month its state, hours and credit', () => {
    const columns = paceColumns(SY, pace)
    expect(columns).toHaveLength(12)
    expect(columns.slice(0, 7).map(c => [c.state, c.hours, c.credit])).toEqual([
      ['off', 0, 0],
      ['off', 0, 0],
      ['reported', 40, 0],
      ['reported', 36, 6],
      ['missing', 0, 0],
      ['reported', 44, 0],
      ['future', 0, 0],
    ])
  })
})

describe('paceTotals', () => {
  it('adds hours and credit up to the last month done, against the goal from the enrolment', () => {
    const points = paceTotals(SY, pace, 50, false)
    expect(points.map(p => p.done)).toEqual([0, 0, 40, 82, 82, 126, null, null, null, null, null, null])
    expect(points.map(p => p.goal)).toEqual([null, null, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500])
  })

  it('projects the recent rhythm from the last month done to August', () => {
    const points = paceTotals(SY, pace, 50, false)
    const recent = pace.recentAvg
    expect(points[5]?.projection).toBe(126)
    expect(points[11]?.projection).toBe(Math.round(126 + recent * 6))
    expect(points[4]?.projection).toBeNull()
  })

  it('projects nothing, and plans no more months, for a stint that ended', () => {
    const points = paceTotals(SY, pace, 50, true)
    expect(points.every(p => p.projection === null)).toBe(true)
    expect(points[11]?.goal).toBe(200)
  })
})
