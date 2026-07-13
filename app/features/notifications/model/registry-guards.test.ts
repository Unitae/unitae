import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { NotificationTypeDefinition } from './notification-definition'
import { assertCancelsReferenceExistingTypes, assertNoDuplicateTypes } from './registry-guards'

const DUPE_ACROSS_MANIFESTS = /board\.document\.created.*boardNotifications.*territoryNotifications/s
const DUPE_WITHIN_MANIFEST = /board\.document\.created.*boardNotifications/s
const DANGLING_CANCELS_REF = /a\.deleted.*a\.imaginary/s
const DUPE_TYPE_A = /a\.b\.c/
const DUPE_TYPE_X = /x\.y\.z/
const GHOST_TYPE_1 = /a\.ghost1/
const GHOST_TYPE_2 = /a\.ghost2/

function fake(
  type: string,
  extras: Partial<NotificationTypeDefinition<unknown>> = {},
): NotificationTypeDefinition<unknown> {
  return {
    type,
    category: { key: 'test', label: () => 'Test' },
    label: () => type,
    routing: { debounceMinutes: 0, recipientStrategy: 'role', recipientRole: 'test-role' },
    payload: z.object({}),
    subject: () => 'Subject',
    renderEmail: () => null,
    example: {},
    ...extras,
  }
}

describe('assertNoDuplicateTypes', () => {
  it('passes when every type is unique across manifests', () => {
    expect(() =>
      assertNoDuplicateTypes({
        boardNotifications: [fake('board.document.created'), fake('board.document.deleted')],
        territoryNotifications: [fake('territory.sync.completed')],
      }),
    ).not.toThrow()
  })

  it('throws when two manifests declare the same type, naming both manifests', () => {
    expect(() =>
      assertNoDuplicateTypes({
        boardNotifications: [fake('board.document.created')],
        territoryNotifications: [fake('board.document.created')],
      }),
    ).toThrow(DUPE_ACROSS_MANIFESTS)
  })

  it('throws when a single manifest declares the same type twice, naming the manifest twice', () => {
    expect(() =>
      assertNoDuplicateTypes({
        boardNotifications: [fake('board.document.created'), fake('board.document.created')],
      }),
    ).toThrow(DUPE_WITHIN_MANIFEST)
  })

  it('lists every duplicate type on its own line when several collide at once', () => {
    let caught: Error | null = null
    try {
      assertNoDuplicateTypes({
        boardNotifications: [fake('a.b.c'), fake('x.y.z')],
        territoryNotifications: [fake('a.b.c'), fake('x.y.z')],
      })
    } catch (err) {
      caught = err as Error
    }
    expect(caught).not.toBeNull()
    expect(caught?.message).toMatch(DUPE_TYPE_A)
    expect(caught?.message).toMatch(DUPE_TYPE_X)
  })
})

describe('assertCancelsReferenceExistingTypes', () => {
  it('passes when every cancels[] entry references a registered type', () => {
    const registry = new Map<string, NotificationTypeDefinition<unknown>>([
      ['a.created', fake('a.created')],
      ['a.updated', fake('a.updated')],
      [
        'a.deleted',
        fake('a.deleted', {
          routing: {
            cancels: ['a.created', 'a.updated'],
            fallback: { debounceMinutes: 0, recipientStrategy: 'role', recipientRole: 'r' },
          },
        }),
      ],
    ])
    expect(() => assertCancelsReferenceExistingTypes(registry)).not.toThrow()
  })

  it('throws when a cancels[] entry references an unregistered type, naming the dangling entry', () => {
    const registry = new Map<string, NotificationTypeDefinition<unknown>>([
      ['a.created', fake('a.created')],
      [
        'a.deleted',
        fake('a.deleted', {
          routing: {
            cancels: ['a.created', 'a.imaginary'],
            fallback: { debounceMinutes: 0, recipientStrategy: 'role', recipientRole: 'r' },
          },
        }),
      ],
    ])
    expect(() => assertCancelsReferenceExistingTypes(registry)).toThrow(DANGLING_CANCELS_REF)
  })

  it('lists every dangling reference when a definition points at multiple unregistered types', () => {
    const registry = new Map<string, NotificationTypeDefinition<unknown>>([
      [
        'a.deleted',
        fake('a.deleted', {
          routing: {
            cancels: ['a.ghost1', 'a.ghost2'],
            fallback: { debounceMinutes: 0, recipientStrategy: 'role', recipientRole: 'r' },
          },
        }),
      ],
    ])
    let caught: Error | null = null
    try {
      assertCancelsReferenceExistingTypes(registry)
    } catch (err) {
      caught = err as Error
    }
    expect(caught?.message).toMatch(GHOST_TYPE_1)
    expect(caught?.message).toMatch(GHOST_TYPE_2)
  })
})
