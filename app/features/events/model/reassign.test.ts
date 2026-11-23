import { describe, expect, it } from 'vitest'

import { assignKey, conflictAction, parseAssignKey, type ReassignRights, reassignHref } from './reassign'

// An assignment falling during an absence offers « Réattribuer » to whoever the event's page lets fill that slot's
// schedule (plan §10): « Attribuer » or « Gérer », or the responsible of that schedule's template. Other readers of the
// programmes get a plain link to the event; a reader of absences alone gets no link, which would only turn them away.

const NONE: ReassignRights = { canViewPrograms: true, fillsEverySchedule: false, roleIds: [] }
// A slot whose schedule's template names role 4 as its responsible.
const slot = { responsibleRoleId: 4 }

describe('conflictAction', () => {
  it('offers no link to a reader of absences who cannot open the programmes', () => {
    expect(conflictAction(slot, { ...NONE, canViewPrograms: false, fillsEverySchedule: true })).toBeNull()
  })

  it('lets whoever fills every schedule reassign any slot, even one whose schedule has no responsible', () => {
    const rights = { ...NONE, fillsEverySchedule: true }
    expect(conflictAction(slot, rights)).toBe('reassign')
    expect(conflictAction({ responsibleRoleId: null }, rights)).toBe('reassign')
  })

  it('lets the responsible of the slot’s schedule reassign it', () => {
    expect(conflictAction(slot, { ...NONE, roleIds: [7, 4] })).toBe('reassign')
  })

  it('shows the event to the responsible of another schedule, and for a schedule without a responsible (D47)', () => {
    const rights = { ...NONE, roleIds: [9] }
    expect(conflictAction(slot, rights)).toBe('view')
    expect(conflictAction({ responsibleRoleId: null }, { ...NONE, roleIds: [4] })).toBe('view')
  })
})

describe('reassignHref', () => {
  it('opens the event on the slot to reassign, or the event alone', () => {
    expect(reassignHref({ kind: 'service', id: 7, eventId: 31 }, 'reassign')).toBe('/programs/events/31?item=service-7')
    expect(reassignHref({ kind: 'part', id: 12, eventId: 31 }, 'view')).toBe('/programs/events/31')
    expect(reassignHref({ kind: 'part', id: 12, eventId: 31 }, null)).toBeNull()
  })
})

describe('assignKey', () => {
  it('names a part and a service apart, their ids coming from two tables', () => {
    expect(assignKey({ kind: 'part', id: 12 })).toBe('part-12')
    expect(parseAssignKey('part-12')).toEqual({ kind: 'part', id: 12 })
    expect(parseAssignKey('service-7')).toEqual({ kind: 'service', id: 7 })
  })

  it('reads nothing from a key it did not write', () => {
    for (const value of ['12', 'part-', 'part-0', 'part-1.5', 'part-abc', 'event-3', 'service-7-1']) {
      expect(parseAssignKey(value)).toBeNull()
    }
  })
})
