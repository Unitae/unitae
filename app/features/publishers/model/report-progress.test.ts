import { describe, expect, it } from 'vitest'

import { reportProgress } from './report-progress'

describe('reportProgress', () => {
  // A report without ministry still counts as filed: the group page's word for it is « irrégulier ».
  it('counts the filed reports, irregular ones included, out of those expected', () => {
    expect(reportProgress(['filed', 'irregular', 'not-filed', 'filed'])).toEqual({ filed: 3, expected: 4, missing: 1 })
  })

  // Someone added after the month owed no report for it: neither filed nor missing.
  it('leaves out the publishers who owed no report that month', () => {
    expect(reportProgress(['filed', 'not-expected', 'not-filed'])).toEqual({ filed: 1, expected: 2, missing: 1 })
  })

  it('is all zeros for nobody', () => {
    expect(reportProgress([])).toEqual({ filed: 0, expected: 0, missing: 0 })
  })
})
