import { describe, expect, it } from 'vitest'
import { emergencyGaps, pastoralSignals, reportStatus } from './member-signals'

const OCTOBER = { month: 9, year: 2026 }

describe('reportStatus', () => {
  it('reads a report with ministry as filed', () => {
    expect(reportStatus({ isPublisher: true }, OCTOBER, { month: 0, year: 2020 })).toBe('filed')
  })

  // The report says the publisher did not preach that month: the activity pages call it irregular.
  it('reads a report without ministry as irregular', () => {
    expect(reportStatus({ isPublisher: false }, OCTOBER, { month: 0, year: 2020 })).toBe('irregular')
  })

  it('reads a month without a report as not filed', () => {
    expect(reportStatus(undefined, OCTOBER, { month: 0, year: 2020 })).toBe('not-filed')
  })

  // Nobody expected a report for a month before the publisher was added to the congregation.
  it('expects no report before the month the publisher was added', () => {
    expect(reportStatus(undefined, OCTOBER, { month: 10, year: 2026 })).toBe('not-expected')
    expect(reportStatus(undefined, OCTOBER, { month: 9, year: 2026 })).toBe('not-filed')
  })

  it('shows a report filed for such a month all the same', () => {
    expect(reportStatus({ isPublisher: true }, OCTOBER, { month: 10, year: 2026 })).toBe('filed')
  })
})

describe('pastoralSignals', () => {
  const now = new Date(2026, 10, 1)

  it('says nothing about a publisher with nothing to note', () => {
    expect(pastoralSignals(now, { inactiveAt: null, baptismDate: null })).toEqual([])
  })

  it('says since when a publisher is inactive', () => {
    expect(pastoralSignals(now, { inactiveAt: new Date(2026, 2, 1), baptismDate: null })).toEqual([
      { kind: 'inactive', since: { month: 2, year: 2026 } },
    ])
  })

  // About a year after the baptism: the overseer plans the first-anniversary visit.
  it.each([
    [new Date(2025, 11, 1), true],
    [new Date(2025, 10, 1), true],
    [new Date(2025, 9, 2), true],
    [new Date(2025, 9, 1), false],
    [new Date(2025, 11, 2), false],
    [new Date(2024, 10, 1), false],
  ])('notes the first baptism anniversary for a baptism on %s: %s', (baptismDate, notes) => {
    const signals = pastoralSignals(now, { inactiveAt: null, baptismDate })
    expect(signals.some(signal => signal.kind === 'baptism-anniversary')).toBe(notes)
  })
})

describe('emergencyGaps', () => {
  it('lists nothing when the emergency information is complete', () => {
    expect(emergencyGaps({ dpaCardUpToDate: true, survivalBackpackReady: true, emergencyContactCount: 1 })).toEqual([])
  })

  it('lists each missing piece', () => {
    expect(emergencyGaps({ dpaCardUpToDate: false, survivalBackpackReady: false, emergencyContactCount: 0 })).toEqual([
      'card',
      'backpack',
      'contact',
    ])
  })
})
