import { describe, expect, it } from 'vitest'
import { canWriteCount, entryWindow, isEntryOpen } from './attendance-access'

const PARIS = 'Europe/Paris'
// Thursday 19 November 2026, 19:00 in Paris (UTC+1).
const START = new Date('2026-11-19T18:00:00Z')

describe('entryWindow', () => {
  it('opens when the meeting starts and closes at local midnight', () => {
    const window = entryWindow(START, PARIS)
    expect(window.opens).toEqual(START)
    expect(window.closes.toISOString()).toBe('2026-11-19T22:59:59.999Z')
  })
})

describe('isEntryOpen', () => {
  it('is closed before the start', () => {
    expect(isEntryOpen(START, PARIS, new Date('2026-11-19T17:59:00Z'))).toBe(false)
  })

  it('is open during the meeting and until local midnight', () => {
    expect(isEntryOpen(START, PARIS, START)).toBe(true)
    expect(isEntryOpen(START, PARIS, new Date('2026-11-19T22:59:00Z'))).toBe(true)
  })

  it('is closed from local midnight on', () => {
    expect(isEntryOpen(START, PARIS, new Date('2026-11-19T23:00:00Z'))).toBe(false)
  })
})

describe('canWriteCount', () => {
  const during = new Date('2026-11-19T19:00:00Z')
  const after = new Date('2026-11-20T08:00:00Z')
  const before = new Date('2026-11-19T12:00:00Z')
  const base = { startDate: START, timeZone: PARIS, actorId: 7 }

  it('lets a recorder set an empty count during the window', () => {
    expect(
      canWriteCount({ ...base, now: during, canRecord: true, canCorrect: false, recordedById: null, hasValue: false }),
    ).toBe(true)
  })

  it('lets a recorder change the count they entered during the window', () => {
    expect(
      canWriteCount({ ...base, now: during, canRecord: true, canCorrect: false, recordedById: 7, hasValue: true }),
    ).toBe(true)
  })

  it('keeps a recorder off a count someone else entered', () => {
    expect(
      canWriteCount({ ...base, now: during, canRecord: true, canCorrect: false, recordedById: 9, hasValue: true }),
    ).toBe(false)
  })

  it('keeps a recorder off a count whose author was deleted', () => {
    expect(
      canWriteCount({ ...base, now: during, canRecord: true, canCorrect: false, recordedById: null, hasValue: true }),
    ).toBe(false)
  })

  it('closes the window to a recorder before the start and after midnight', () => {
    expect(
      canWriteCount({ ...base, now: before, canRecord: true, canCorrect: false, recordedById: null, hasValue: false }),
    ).toBe(false)
    expect(
      canWriteCount({ ...base, now: after, canRecord: true, canCorrect: false, recordedById: 7, hasValue: true }),
    ).toBe(false)
  })

  it('lets a corrector set or change anything at any time', () => {
    for (const now of [before, during, after]) {
      expect(canWriteCount({ ...base, now, canRecord: false, canCorrect: true, recordedById: 9, hasValue: true })).toBe(
        true,
      )
    }
  })

  it('refuses someone with neither right', () => {
    expect(
      canWriteCount({ ...base, now: during, canRecord: false, canCorrect: false, recordedById: null, hasValue: false }),
    ).toBe(false)
  })
})
