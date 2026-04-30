import { describe, expect, it } from 'vitest'
import { groupEvents } from './flush-settled.server'

describe('groupEvents', () => {
  it('returns empty map for empty input', () => {
    const result = groupEvents([])
    expect(result.size).toBe(0)
  })

  it('groups a single event into one entry', () => {
    const events = [{ congregationId: 1, recipientId: 10, recipientRole: null, type: 'board.document.created', id: 1 }]
    const result = groupEvents(events)
    expect(result.size).toBe(1)
    const entries = [...result.values()]
    expect(entries[0]).toHaveLength(1)
    expect(entries[0][0].id).toBe(1)
  })

  it('groups events from the same congregation + user + type family together', () => {
    const events = [
      { congregationId: 1, recipientId: 10, recipientRole: null, type: 'board.document.created', id: 1 },
      { congregationId: 1, recipientId: 10, recipientRole: null, type: 'board.document.updated', id: 2 },
    ]
    const result = groupEvents(events)
    expect(result.size).toBe(1)
    expect([...result.values()][0]).toHaveLength(2)
  })

  it('separates events from different congregations', () => {
    const events = [
      { congregationId: 1, recipientId: 10, recipientRole: null, type: 'board.document.created', id: 1 },
      { congregationId: 2, recipientId: 10, recipientRole: null, type: 'board.document.created', id: 2 },
    ]
    const result = groupEvents(events)
    expect(result.size).toBe(2)
  })

  it('separates events for different recipients', () => {
    const events = [
      { congregationId: 1, recipientId: 10, recipientRole: null, type: 'board.document.created', id: 1 },
      { congregationId: 1, recipientId: 20, recipientRole: null, type: 'board.document.created', id: 2 },
    ]
    const result = groupEvents(events)
    expect(result.size).toBe(2)
  })

  it('separates events with different type families', () => {
    const events = [
      { congregationId: 1, recipientId: 10, recipientRole: null, type: 'board.document.created', id: 1 },
      { congregationId: 1, recipientId: 10, recipientRole: null, type: 'attribution.created', id: 2 },
    ]
    const result = groupEvents(events)
    expect(result.size).toBe(2)
  })

  it('extracts type family as the first dot-delimited segment', () => {
    const events = [
      { congregationId: 1, recipientId: 10, recipientRole: null, type: 'board.document.created', id: 1 },
      { congregationId: 1, recipientId: 10, recipientRole: null, type: 'board.section.deleted', id: 2 },
      { congregationId: 1, recipientId: 10, recipientRole: null, type: 'board.document.updated', id: 3 },
    ]
    const result = groupEvents(events)
    expect(result.size).toBe(1)
    expect([...result.values()][0]).toHaveLength(3)
  })

  it('uses recipientRole when recipientId is null', () => {
    const events = [
      { congregationId: 1, recipientId: null, recipientRole: 'board-validator', type: 'board.document.created', id: 1 },
      { congregationId: 1, recipientId: null, recipientRole: 'board-validator', type: 'board.document.updated', id: 2 },
    ]
    const result = groupEvents(events)
    expect(result.size).toBe(1)
  })

  it('separates events with different recipient roles', () => {
    const events = [
      { congregationId: 1, recipientId: null, recipientRole: 'board-validator', type: 'board.document.created', id: 1 },
      { congregationId: 1, recipientId: null, recipientRole: 'admin', type: 'board.document.created', id: 2 },
    ]
    const result = groupEvents(events)
    expect(result.size).toBe(2)
  })

  it('treats null recipientRole as empty string in the group key', () => {
    const events = [
      { congregationId: 1, recipientId: null, recipientRole: null, type: 'board.document.created', id: 1 },
      { congregationId: 1, recipientId: null, recipientRole: null, type: 'board.document.updated', id: 2 },
    ]
    const result = groupEvents(events)
    expect(result.size).toBe(1)
  })

  it('keeps user-based and role-based recipients in separate groups', () => {
    const events = [
      { congregationId: 1, recipientId: 10, recipientRole: null, type: 'board.document.created', id: 1 },
      { congregationId: 1, recipientId: null, recipientRole: 'board-validator', type: 'board.document.created', id: 2 },
    ]
    const result = groupEvents(events)
    expect(result.size).toBe(2)
  })
})
