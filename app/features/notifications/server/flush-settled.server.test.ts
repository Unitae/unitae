import { describe, expect, it } from 'vitest'
import { groupEvents, type NotificationEventRow } from './flush-settled.server'

function row(overrides: Partial<NotificationEventRow>): NotificationEventRow {
  return {
    id: 1,
    type: 'board.document.created',
    status: 'pending',
    entityType: 'BoardDocument',
    entityId: 100,
    recipientId: null,
    recipientRole: null,
    actorId: null,
    payload: '{}',
    debounceKey: 'k',
    debounceUntil: null,
    processedAt: null,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    updatedAt: new Date('2026-07-01T00:00:00Z'),
    congregationId: 1,
    ...overrides,
  }
}

describe('groupEvents', () => {
  it('returns empty map for empty input', () => {
    const result = groupEvents([])
    expect(result.size).toBe(0)
  })

  it('groups a single event into one entry', () => {
    const result = groupEvents([row({ id: 1, recipientId: 10 })])
    expect(result.size).toBe(1)
    const [first] = [...result.values()]
    expect(first).toHaveLength(1)
    expect(first[0].id).toBe(1)
  })

  it('groups events from the same congregation + user + type family together', () => {
    const result = groupEvents([
      row({ id: 1, recipientId: 10, type: 'board.document.created' }),
      row({ id: 2, recipientId: 10, type: 'board.document.updated' }),
    ])
    expect(result.size).toBe(1)
    expect([...result.values()][0]).toHaveLength(2)
  })

  it('separates events from different congregations', () => {
    const result = groupEvents([
      row({ id: 1, congregationId: 1, recipientId: 10 }),
      row({ id: 2, congregationId: 2, recipientId: 10 }),
    ])
    expect(result.size).toBe(2)
  })

  it('separates events for different recipients', () => {
    const result = groupEvents([row({ id: 1, recipientId: 10 }), row({ id: 2, recipientId: 20 })])
    expect(result.size).toBe(2)
  })

  it('separates events with different type families', () => {
    const result = groupEvents([
      row({ id: 1, recipientId: 10, type: 'board.document.created' }),
      row({ id: 2, recipientId: 10, type: 'attribution.created' }),
    ])
    expect(result.size).toBe(2)
  })

  it('extracts type family as the first dot-delimited segment', () => {
    const result = groupEvents([
      row({ id: 1, recipientId: 10, type: 'board.document.created' }),
      row({ id: 2, recipientId: 10, type: 'board.section.deleted' }),
      row({ id: 3, recipientId: 10, type: 'board.document.updated' }),
    ])
    expect(result.size).toBe(1)
    expect([...result.values()][0]).toHaveLength(3)
  })

  it('uses recipientRole when recipientId is null', () => {
    const result = groupEvents([
      row({ id: 1, recipientRole: 'board-validator', type: 'board.document.created' }),
      row({ id: 2, recipientRole: 'board-validator', type: 'board.document.updated' }),
    ])
    expect(result.size).toBe(1)
  })

  it('separates events with different recipient roles', () => {
    const result = groupEvents([
      row({ id: 1, recipientRole: 'board-validator' }),
      row({ id: 2, recipientRole: 'admin' }),
    ])
    expect(result.size).toBe(2)
  })

  it('treats null recipientRole as empty string in the group key', () => {
    const result = groupEvents([row({ id: 1 }), row({ id: 2, type: 'board.document.updated' })])
    expect(result.size).toBe(1)
  })

  it('keeps user-based and role-based recipients in separate groups', () => {
    const result = groupEvents([row({ id: 1, recipientId: 10 }), row({ id: 2, recipientRole: 'board-validator' })])
    expect(result.size).toBe(2)
  })
})
