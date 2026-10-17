import { describe, expect, it } from 'vitest'
import { PublisherType } from '~/shared/types/publisher-type'

import { reportTypeForMonth } from './activity-report-type'

describe('reportTypeForMonth', () => {
  it('takes the type of the enrolment covering the month, whatever was submitted', () => {
    expect(reportTypeForMonth(PublisherType.PionnierAuxiliaires, PublisherType.Normal)).toBe(
      PublisherType.PionnierAuxiliaires,
    )
  })

  it('takes the submitted type when no enrolment covers the month', () => {
    expect(reportTypeForMonth(null, PublisherType.PionnierAuxiliaires)).toBe(PublisherType.PionnierAuxiliaires)
  })

  it('falls back to a publisher report when nothing was submitted either', () => {
    expect(reportTypeForMonth(null, undefined)).toBe(PublisherType.Normal)
  })
})
