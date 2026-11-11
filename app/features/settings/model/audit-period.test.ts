import { describe, expect, it } from 'vitest'
import { auditPeriod } from './audit-period'

const today = '2026-11-11'

describe('auditPeriod', () => {
  it('reads the last 30 days, today included, when nothing is chosen', () => {
    expect(auditPeriod({}, today)).toEqual({ period: '30d', from: '2026-10-13', to: undefined })
  })

  it('counts the last 7 days back from today', () => {
    expect(auditPeriod({ period: '7d' }, today)).toEqual({ period: '7d', from: '2026-11-05', to: undefined })
  })

  it('counts months on the calendar', () => {
    expect(auditPeriod({ period: '3m' }, today).from).toBe('2026-08-12')
    expect(auditPeriod({ period: '12m' }, today).from).toBe('2025-11-12')
  })

  it('keeps a month end inside a shorter month', () => {
    expect(auditPeriod({ period: '3m' }, '2026-05-31').from).toBe('2026-03-01')
  })

  it('reads everything for all time', () => {
    expect(auditPeriod({ period: 'all' }, today)).toEqual({ period: 'all', from: undefined, to: undefined })
  })

  it('reads chosen dates, in either order', () => {
    expect(auditPeriod({ period: 'custom', from: '2026-10-01', to: '2026-10-15' }, today)).toEqual({
      period: 'custom',
      from: '2026-10-01',
      to: '2026-10-15',
    })
    expect(auditPeriod({ period: 'custom', from: '2026-10-15', to: '2026-10-01' }, today)).toEqual({
      period: 'custom',
      from: '2026-10-01',
      to: '2026-10-15',
    })
  })

  it('leaves out a chosen date that is not one', () => {
    expect(auditPeriod({ period: 'custom', from: '2026-13-45', to: 'soon' }, today)).toEqual({
      period: 'custom',
      from: undefined,
      to: undefined,
    })
  })

  it('falls back to 30 days for a period it does not know', () => {
    expect(auditPeriod({ period: 'forever' }, today).period).toBe('30d')
  })
})
