import { describe, expect, it } from 'vitest'

import { hasMetricsToShow } from './MetricsRow'

describe('hasMetricsToShow', () => {
  it('hides a row where every counter reads zero', () => {
    expect(hasMetricsToShow({ territories: { total: 0, assigned: 0, late: 0 }, publishers: { total: 0 } })).toBe(false)
  })

  it('shows the row as soon as one counter is non-zero', () => {
    expect(hasMetricsToShow({ territories: { total: 0, assigned: 0, late: 0 }, publishers: { total: 3 } })).toBe(true)
    expect(hasMetricsToShow({ territories: { total: 12, assigned: 0, late: 0 }, publishers: { total: 0 } })).toBe(true)
  })

  it('judges only the counters the viewer may see', () => {
    expect(hasMetricsToShow({ territories: null, publishers: { total: 0 } })).toBe(false)
    expect(hasMetricsToShow({ territories: { total: 5, assigned: 1, late: 0 }, publishers: null })).toBe(true)
  })

  it('hides the row when the viewer may see no counter at all', () => {
    expect(hasMetricsToShow({ territories: null, publishers: null })).toBe(false)
  })
})
