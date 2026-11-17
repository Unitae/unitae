import { describe, expect, it } from 'vitest'
import { addMonths, planRecurringEvents } from './recurring-events'

describe('addMonths', () => {
  it('moves by calendar months', () => {
    expect(addMonths('2026-11-16', 2)).toBe('2027-01-16')
    expect(addMonths('2026-12-05', 1)).toBe('2027-01-05')
  })

  it('stops at the end of a shorter month', () => {
    expect(addMonths('2026-12-31', 2)).toBe('2027-02-28')
    expect(addMonths('2027-12-31', 2)).toBe('2028-02-29')
  })
})

// Thursday meetings (weekDay 4), seen on Monday 16 November 2026: the horizon is 16 January 2027.
const base = { weekDay: 4, today: '2026-11-16', existingDays: new Set<string>() }

describe('planRecurringEvents', () => {
  it('creates every Thursday up to two months ahead for a template that never had any', () => {
    const plan = planRecurringEvents({ ...base, generatedUntil: null, lastEventDay: null })

    expect(plan.days[0]).toBe('2026-11-19')
    expect(plan.days.at(-1)).toBe('2027-01-14')
    expect(plan.days).toHaveLength(9)
    expect(plan.generatedUntil).toBe('2027-01-16')
  })

  it('starts after the template’s last event on its first run, so passed weeks before it stay empty', () => {
    const plan = planRecurringEvents({ ...base, generatedUntil: null, lastEventDay: '2026-12-10' })

    expect(plan.days[0]).toBe('2026-12-17')
    expect(plan.generatedUntil).toBe('2027-01-16')
  })

  it('creates nothing when programmes already run beyond the horizon, and moves the mark to the last one', () => {
    const plan = planRecurringEvents({ ...base, generatedUntil: null, lastEventDay: '2027-05-27' })

    expect(plan.days).toEqual([])
    expect(plan.generatedUntil).toBe('2027-05-27')
  })

  it('only goes forward from the mark: a day at or before it is never filled again', () => {
    const plan = planRecurringEvents({ ...base, generatedUntil: '2027-01-08', lastEventDay: '2026-12-31' })

    expect(plan.days).toEqual(['2027-01-14'])
    expect(plan.generatedUntil).toBe('2027-01-16')
  })

  it('keeps a mark set beyond the horizon by a long series', () => {
    const plan = planRecurringEvents({ ...base, generatedUntil: '2027-03-31', lastEventDay: '2027-03-25' })

    expect(plan.days).toEqual([])
    expect(plan.generatedUntil).toBe('2027-03-31')
  })

  it('never creates a day in the past, even long after the mark', () => {
    const plan = planRecurringEvents({ ...base, generatedUntil: '2026-09-01', lastEventDay: '2026-09-01' })

    expect(plan.days[0]).toBe('2026-11-19')
  })

  it('leaves out a day that already has an event of the template', () => {
    const plan = planRecurringEvents({
      ...base,
      generatedUntil: '2026-12-31',
      lastEventDay: '2026-12-31',
      existingDays: new Set(['2027-01-07']),
    })

    expect(plan.days).toEqual(['2027-01-14'])
  })
})
