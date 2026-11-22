import { describe, expect, it } from 'vitest'
import { computeNotifyTargets } from './release-notifications.server'

describe('computeNotifyTargets', () => {
  it('names each part speaker and reader, then each service assignee, in that order', () => {
    const targets = computeNotifyTargets(
      [
        { id: 1, name: 'Discours', hasConflict: false, assigneeId: 10, assistantId: null },
        { id: 2, name: 'Lecture', hasConflict: false, assigneeId: 11, assistantId: 12 },
      ],
      [{ id: 7, name: 'Sono', hasConflict: false, assigneeId: 13 }],
    )

    expect(targets).toEqual([
      { entityType: 'Item', entityId: 1, assignmentName: 'Discours', memberId: 10, role: 'speaker' },
      { entityType: 'Item', entityId: 2, assignmentName: 'Lecture', memberId: 11, role: 'speaker' },
      { entityType: 'Item', entityId: 2, assignmentName: 'Lecture', memberId: 12, role: 'reader' },
      { entityType: 'Item', entityId: 7, assignmentName: 'Sono', memberId: 13, role: 'servant' },
    ])
  })

  it('leaves out parts and services nobody holds', () => {
    expect(
      computeNotifyTargets(
        [{ id: 1, name: 'Cantique', hasConflict: false, assigneeId: null, assistantId: null }],
        [{ id: 7, name: 'Accueil', hasConflict: false, assigneeId: null }],
      ),
    ).toEqual([])
  })
})
