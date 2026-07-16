import { describe, expect, it } from 'vitest'
import { ConflictError } from '~/shared/errors/app-error.server'
import { assertCanRelease, EVENT_STATUS_ERRORS } from './event-status.policy'

describe('assertCanRelease', () => {
  it('does not throw when there are no assignments', () => {
    expect(() => assertCanRelease({ parts: [], serviceRoles: [] })).not.toThrow()
  })

  it('does not throw when every assignment is conflict-free', () => {
    expect(() =>
      assertCanRelease({ parts: [{ hasConflict: false }], serviceRoles: [{ hasConflict: false }] }),
    ).not.toThrow()
  })

  it('throws ConflictError when a part assignment has a conflict', () => {
    expect(() => assertCanRelease({ parts: [{ hasConflict: true }], serviceRoles: [] })).toThrow(ConflictError)
  })

  it('throws ConflictError when a service role assignment has a conflict', () => {
    expect(() => assertCanRelease({ parts: [], serviceRoles: [{ hasConflict: true }] })).toThrow(ConflictError)
  })

  // The error is a fixed short line. The event view page enumerates each
  // conflict inline (badge next to the assignee), so the toast intentionally
  // does NOT list names — with several conflicts on the same event the toast
  // would become unreadable.
  it('uses the fixed release-blocked message verbatim (no name enumeration)', () => {
    try {
      assertCanRelease({ parts: [{ hasConflict: true }, { hasConflict: true }], serviceRoles: [{ hasConflict: true }] })
      throw new Error('expected assertCanRelease to throw')
    } catch (e) {
      expect(e).toBeInstanceOf(ConflictError)
      expect((e as Error).message).toBe(EVENT_STATUS_ERRORS.releaseBlockedByConflicts)
    }
  })
})
