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
  const NOTHING = { inactiveAt: null, baptismDate: null, arrivedAt: null, lastPastoralVisitAt: null }

  it('says nothing about a publisher with nothing to note', () => {
    expect(pastoralSignals(now, { ...NOTHING })).toEqual([])
  })

  it('says since when a publisher is inactive', () => {
    expect(pastoralSignals(now, { ...NOTHING, inactiveAt: new Date(2026, 2, 1) })).toEqual([
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
    const signals = pastoralSignals(now, { ...NOTHING, baptismDate })
    expect(signals.some(signal => signal.kind === 'baptism-anniversary')).toBe(notes)
  })
})

describe('pastoralSignals — arrival and visits', () => {
  const now = new Date(2026, 10, 1)
  const NOTHING = { inactiveAt: null, baptismDate: null, arrivedAt: null, lastPastoralVisitAt: null }

  // For three months after the arrival: the overseer plans the welcome visit.
  it.each([
    [new Date(2026, 8, 15), true],
    [new Date(2026, 7, 2), true],
    [new Date(2026, 7, 1), false],
    [new Date(2025, 10, 1), false],
    [new Date(2026, 11, 1), false],
  ])('flags an arrival on %s as new: %s', (arrivedAt, flagged) => {
    const signals = pastoralSignals(now, { ...NOTHING, arrivedAt })
    expect(signals.some(signal => signal.kind === 'new-arrival')).toBe(flagged)
  })

  // Shown only for a publisher who has one: no « never visited » label.
  it('names the month of the last pastoral visit when there is one', () => {
    expect(pastoralSignals(now, { ...NOTHING, lastPastoralVisitAt: new Date(2026, 2, 10) })).toEqual([
      { kind: 'last-visit', on: { month: 2, year: 2026 } },
    ])
    expect(pastoralSignals(now, NOTHING)).toEqual([])
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
