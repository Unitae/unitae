import { describe, expect, it } from 'vitest'

import { assignKey, conflictAction, parseAssignKey, type ReassignRights, reassignHref } from './reassign'

// An assignment falling during an absence offers « Réattribuer » to whoever the event's page lets fill that slot: the
// right to assign parts, or the event's responsible (a service responsible for a service). Other readers of the
// programmes get a plain link to the event; a reader of absences alone gets no link, which would only turn them away.

const NONE: ReassignRights = {
  canViewPrograms: true,
  canAssignParts: false,
  partTemplateIds: [],
  serviceTemplateIds: [],
}
const part = { kind: 'part' as const, templateId: 4 }
const service = { kind: 'service' as const, templateId: 4 }

describe('conflictAction', () => {
  it('offers no link to a reader of absences who cannot open the programmes', () => {
    expect(conflictAction(part, { ...NONE, canViewPrograms: false, canAssignParts: true })).toBeNull()
  })

  it('lets the holder of the right to assign reassign any part or service', () => {
    const rights = { ...NONE, canAssignParts: true }
    expect(conflictAction(part, rights)).toBe('reassign')
    expect(conflictAction(service, rights)).toBe('reassign')
    expect(conflictAction({ kind: 'part', templateId: null }, rights)).toBe('reassign')
  })

  it('lets the responsible of the event reassign its parts and services', () => {
    const rights = { ...NONE, partTemplateIds: [4], serviceTemplateIds: [4] }
    expect(conflictAction(part, rights)).toBe('reassign')
    expect(conflictAction(service, rights)).toBe('reassign')
  })

  it('lets a service responsible reassign the services only', () => {
    const rights = { ...NONE, serviceTemplateIds: [4] }
    expect(conflictAction(service, rights)).toBe('reassign')
    expect(conflictAction(part, rights)).toBe('view')
  })

  it('shows the event to the responsible of another one, and for an event without a template', () => {
    const rights = { ...NONE, partTemplateIds: [9], serviceTemplateIds: [9] }
    expect(conflictAction(part, rights)).toBe('view')
    expect(conflictAction({ kind: 'part', templateId: null }, rights)).toBe('view')
  })
})

describe('reassignHref', () => {
  it('opens the event on the slot to reassign, or the event alone', () => {
    expect(reassignHref({ kind: 'service', id: 7, eventId: 31 }, 'reassign')).toBe(
      '/programs/events/31?assign=service-7',
    )
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
