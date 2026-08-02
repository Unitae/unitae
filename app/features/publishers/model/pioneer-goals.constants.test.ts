import { describe, expect, it } from 'vitest'
import { PublisherType } from '~/shared/types/publisher-type'

import { DEFAULT_MONTHLY_GOALS, PIONEER_TYPES } from './pioneer-goals.constants'

describe('pioneer goal constants', () => {
  it('PIONEER_TYPES covers exactly the non-Normal publisher types', () => {
    const expected = Object.values(PublisherType)
      .filter(type => type !== PublisherType.Normal)
      .sort()
    expect([...PIONEER_TYPES].sort()).toEqual(expected)
  })

  it('has a default rate for every publisher type', () => {
    for (const type of Object.values(PublisherType)) {
      expect(DEFAULT_MONTHLY_GOALS[type]).toBeTypeOf('number')
    }
  })
})
