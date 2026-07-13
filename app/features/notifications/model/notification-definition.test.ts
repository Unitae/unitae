import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { defineNotificationType, type NotificationTypeDefinition } from './notification-definition'

describe('defineNotificationType', () => {
  it('returns the definition object unchanged (identity)', () => {
    const payloadSchema = z.object({ id: z.number() })

    const def = defineNotificationType({
      type: 'test.event',
      category: { key: 'test', label: () => 'Test category' },
      label: () => 'Test event',
      routing: { debounceMinutes: 0, recipientStrategy: 'role', recipientRole: 'test-role' },
      payload: payloadSchema,
      subject: () => 'Test Subject',
      renderEmail: () => null,
      example: { id: 42 },
    })

    expect(def.type).toBe('test.event')
    expect(def.category.key).toBe('test')
    expect(def.example).toEqual({ id: 42 })
    expect(def.payload).toBe(payloadSchema)
  })

  it('preserves the payload generic through subject and renderEmail signatures', () => {
    const def = defineNotificationType({
      type: 'test.event',
      category: { key: 'test', label: () => 'Test category' },
      label: () => 'Test event',
      routing: { debounceMinutes: 0, recipientStrategy: 'role', recipientRole: 'test-role' },
      payload: z.object({ name: z.string() }),
      subject: payload => `Hello ${payload.name}`,
      renderEmail: ({ payload }) => `<span>${payload.name}</span>`,
      example: { name: 'Marie' },
    })

    // TS-level: subject and renderEmail must accept the inferred payload shape.
    expectTypeOf(def.subject).parameter(0).toEqualTypeOf<{ name: string }>()
    expectTypeOf<Parameters<typeof def.renderEmail>[0]['payload']>().toEqualTypeOf<{ name: string }>()
    expectTypeOf(def.example).toEqualTypeOf<{ name: string }>()

    // Runtime: subject uses the payload as declared.
    expect(def.subject({ name: 'Marie' })).toBe('Hello Marie')
  })

  it('rejects an example that does not satisfy the schema (via runtime parse)', () => {
    // A definition's example must parse cleanly — the contract test enforces this
    // for every registered definition. This test asserts safeParse catches mismatches.
    const def: NotificationTypeDefinition<{ id: number }> = {
      type: 'test.event',
      category: { key: 'test', label: () => 'Test category' },
      label: () => 'Test event',
      routing: { debounceMinutes: 0, recipientStrategy: 'role', recipientRole: 'test-role' },
      payload: z.object({ id: z.number() }),
      subject: () => 'x',
      renderEmail: () => null,
      // biome-ignore lint/suspicious/noExplicitAny: intentional bad example for the assertion
      example: { id: 'not a number' as any },
    }

    expect(def.payload.safeParse(def.example).success).toBe(false)
  })
})
