import { describe, expect, it } from 'vitest'
import { PublisherType } from '~/shared/types/publisher-type'

import { ageOn, anonymisationDate, toRecordEnrolments } from './publisher-record'

describe('toRecordEnrolments', () => {
  it('reads each stint as its service and marks the one covering this month', () => {
    const rows = toRecordEnrolments(
      [
        {
          id: 1,
          type: PublisherType.PionnierAuxiliaires,
          startMonth: 2,
          startYear: 2024,
          endMonth: 2,
          endYear: 2024,
          monthlyGoal: 30,
        },
        {
          id: 2,
          type: PublisherType.PionnierPermanant,
          startMonth: 8,
          startYear: 2024,
          endMonth: null,
          endYear: null,
          monthlyGoal: null,
        },
      ],
      { month: 2, year: 2027 },
    )
    expect(rows).toEqual([
      {
        id: 1,
        mode: 'monthly-aux',
        startMonth: 2,
        startYear: 2024,
        endMonth: 2,
        endYear: 2024,
        monthlyGoal: 30,
        current: false,
      },
      {
        id: 2,
        mode: 'permanent',
        startMonth: 8,
        startYear: 2024,
        endMonth: null,
        endYear: null,
        monthlyGoal: null,
        current: true,
      },
    ])
  })
})

describe('ageOn', () => {
  const born = new Date('1981-05-14T00:00:00Z')

  it('counts the birthdays passed by that day', () => {
    expect(ageOn(born, '2027-03-16')).toBe(45)
    expect(ageOn(born, '2027-05-14')).toBe(46)
  })
})

describe('anonymisationDate', () => {
  it('falls the given number of months after the departure', () => {
    expect(anonymisationDate(new Date('2026-12-04T00:00:00Z'), 6).toISOString()).toBe('2027-06-04T00:00:00.000Z')
  })
})
