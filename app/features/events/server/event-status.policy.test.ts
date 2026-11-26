import { describe, expect, it } from 'vitest'
import { ConflictError } from '~/shared/errors/app-error.server'
import { assertCanRelease, EVENT_STATUS_ERRORS, scheduleRefusal } from './event-status.policy'

describe('assertCanRelease', () => {
  it('does not throw when there are no assignments', () => {
    expect(() => assertCanRelease({ eventParts: [], eventServiceParts: [] })).not.toThrow()
  })

  it('does not throw when every assignment is conflict-free', () => {
    expect(() =>
      assertCanRelease({ eventParts: [{ hasConflict: false }], eventServiceParts: [{ hasConflict: false }] }),
    ).not.toThrow()
  })

  it('throws ConflictError when a part assignment has a conflict', () => {
    expect(() => assertCanRelease({ eventParts: [{ hasConflict: true }], eventServiceParts: [] })).toThrow(
      ConflictError,
    )
  })

  it('throws ConflictError when a service role assignment has a conflict', () => {
    expect(() => assertCanRelease({ eventParts: [], eventServiceParts: [{ hasConflict: true }] })).toThrow(
      ConflictError,
    )
  })

  // The error is a fixed short line. The event view page enumerates each
  // conflict inline (badge next to the assignee), so the toast intentionally
  // does NOT list names — with several conflicts on the same event the toast
  // would become unreadable.
  it('uses the fixed release-blocked message verbatim (no name enumeration)', () => {
    try {
      assertCanRelease({
        eventParts: [{ hasConflict: true }, { hasConflict: true }],
        eventServiceParts: [{ hasConflict: true }],
      })
      throw new Error('expected assertCanRelease to throw')
    } catch (e) {
      expect(e).toBeInstanceOf(ConflictError)
      expect((e as Error).message).toBe(EVENT_STATUS_ERRORS.releaseBlockedByConflicts)
    }
  })
})

describe('scheduleRefusal, what publishing a schedule refuses (shared by publishing and its preview)', () => {
  const midweek = {
    key: 'midweek',
    scheduleTemplates: [{ scheduleTemplate: { _count: { parts: 12, serviceParts: 5 } } }],
  }
  const item = (hasConflict = false) => ({ hasConflict })

  it('lets through a schedule with items and nobody away, filled or not', () => {
    expect(scheduleRefusal({ kind: 'programme', items: [item()], fromTemplate: true }, midweek)).toBeNull()
    expect(scheduleRefusal({ kind: 'duty', items: [item(), item()], fromTemplate: true }, midweek)).toBeNull()
  })

  it('holds back a programme still to give, before anything else', () => {
    expect(scheduleRefusal({ kind: 'programme', items: [], fromTemplate: true }, midweek)).toBe('awaiting')
  })

  it('holds back an empty schedule: no schedule is published empty', () => {
    expect(scheduleRefusal({ kind: 'duty', items: [], fromTemplate: true }, midweek)).toBe('empty')
    // Added by hand, a programme has no template's parts to wait for: it is empty, not awaiting.
    expect(scheduleRefusal({ kind: 'programme', items: [], fromTemplate: false }, midweek)).toBe('empty')
  })

  it('holds back a schedule where someone assigned is away that day', () => {
    expect(scheduleRefusal({ kind: 'duty', items: [item(), item(true)], fromTemplate: true }, midweek)).toBe(
      'conflicts',
    )
  })
})
