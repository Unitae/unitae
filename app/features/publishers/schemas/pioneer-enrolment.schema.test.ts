import { describe, expect, it } from 'vitest'

import { PublisherType } from '~/shared/types/publisher-type'
import { pioneerEnrolmentSchema } from './pioneer-enrolment.schema'

const base = {
  type: PublisherType.PionnierPermanant,
  startMonth: '8',
  startYear: '2025',
}

describe('pioneerEnrolmentSchema', () => {
  it('accepts an ongoing stint with no end and no goal', () => {
    const result = pioneerEnrolmentSchema.safeParse(base)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.endMonth).toBeUndefined()
      expect(result.data.endYear).toBeUndefined()
      expect(result.data.monthlyGoal).toBeUndefined()
    }
  })

  it('coerces empty-string end fields to undefined (an ongoing stint)', () => {
    const result = pioneerEnrolmentSchema.safeParse({ ...base, endMonth: '', endYear: '', monthlyGoal: '' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.endMonth).toBeUndefined()
      expect(result.data.endYear).toBeUndefined()
      expect(result.data.monthlyGoal).toBeUndefined()
    }
  })

  it('accepts a closed stint whose end is on or after the start', () => {
    expect(pioneerEnrolmentSchema.safeParse({ ...base, endMonth: '10', endYear: '2025' }).success).toBe(true)
    // end == start
    expect(pioneerEnrolmentSchema.safeParse({ ...base, endMonth: '8', endYear: '2025' }).success).toBe(true)
  })

  it('accepts a single-month auxiliary stint with a per-person goal', () => {
    const result = pioneerEnrolmentSchema.safeParse({
      type: PublisherType.PionnierAuxiliaires,
      startMonth: '2',
      startYear: '2026',
      endMonth: '2',
      endYear: '2026',
      monthlyGoal: '15',
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.monthlyGoal).toBe(15)
  })

  it('rejects Normal — an enrolment is always a pioneer type', () => {
    expect(pioneerEnrolmentSchema.safeParse({ ...base, type: PublisherType.Normal }).success).toBe(false)
  })

  it('rejects a non-positive monthly goal', () => {
    expect(pioneerEnrolmentSchema.safeParse({ ...base, monthlyGoal: '0' }).success).toBe(false)
    expect(pioneerEnrolmentSchema.safeParse({ ...base, monthlyGoal: '-5' }).success).toBe(false)
  })

  it('rejects an end that falls before the start', () => {
    const result = pioneerEnrolmentSchema.safeParse({ ...base, endMonth: '5', endYear: '2025' })
    expect(result.success).toBe(false)
  })

  it('rejects an out-of-range month', () => {
    expect(pioneerEnrolmentSchema.safeParse({ ...base, startMonth: '12' }).success).toBe(false)
  })

  it('rejects an unpaired end bound (one of month/year set, the other missing)', () => {
    expect(pioneerEnrolmentSchema.safeParse({ ...base, endMonth: '10' }).success).toBe(false)
    expect(pioneerEnrolmentSchema.safeParse({ ...base, endYear: '2025' }).success).toBe(false)
  })
})
