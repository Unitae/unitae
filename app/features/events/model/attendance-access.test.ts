import { describe, expect, it } from 'vitest'
import { Permission } from '~/shared/types/permission'
import { attendanceRights, canWriteCount, entryWindow, isEntryOpen } from './attendance-access'

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

describe('entryWindow on the days the clocks change', () => {
  it('closes at local midnight on the 25-hour day', () => {
    // Sunday 25 October 2026, 10:00 in Paris, already back on UTC+1.
    expect(entryWindow(new Date('2026-10-25T09:00:00Z'), PARIS).closes.toISOString()).toBe('2026-10-25T22:59:59.999Z')
  })

  it('closes at local midnight on the 23-hour day', () => {
    // Sunday 28 March 2027, 10:00 in Paris, already on UTC+2.
    expect(entryWindow(new Date('2027-03-28T08:00:00Z'), PARIS).closes.toISOString()).toBe('2027-03-28T21:59:59.999Z')
  })

  it('follows the congregation’s day when it ends after midnight UTC', () => {
    // Thursday 19 November 2026, 19:00 in New York is already Friday in UTC.
    const start = new Date('2026-11-20T00:00:00Z')
    expect(entryWindow(start, 'America/New_York').closes.toISOString()).toBe('2026-11-20T04:59:59.999Z')
    expect(isEntryOpen(start, 'America/New_York', new Date('2026-11-20T03:00:00Z'))).toBe(true)
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

describe('attendanceRights', () => {
  it('reads the two entry rights from the caller’s permissions', () => {
    expect(attendanceRights(new Set([Permission.CanRecordAttendance]))).toEqual({ canRecord: true, canCorrect: false })
    expect(attendanceRights(new Set([Permission.CanCorrectAttendance]))).toEqual({ canRecord: false, canCorrect: true })
    expect(attendanceRights(new Set([Permission.CanViewPrograms]))).toEqual({ canRecord: false, canCorrect: false })
  })
})
