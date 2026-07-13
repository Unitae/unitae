import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { defineNotificationType, manifest, type NotificationTypeDefinition } from './notification-definition'

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

  it('infers T from the Zod schema itself, not from a caller-supplied T annotation', () => {
    // The schema-first signature `<S extends z.ZodTypeAny>` uses `z.infer<S>`
    // as the source of T. Callers don't declare T; the schema defines it.
    // A schema whose output has an extra field must flow that field to the
    // subject/renderEmail/example T slots.
    const def = defineNotificationType({
      type: 'test.event',
      category: { key: 'test', label: () => 'Test category' },
      label: () => 'Test event',
      routing: { debounceMinutes: 0, recipientStrategy: 'role', recipientRole: 'test-role' },
      payload: z.object({ name: z.string(), count: z.number() }),
      subject: payload => `${payload.name} x${payload.count}`,
      renderEmail: () => null,
      example: { name: 'Marie', count: 3 },
    })

    // Type-level: the count field must flow into subject's payload param.
    expectTypeOf(def.subject).parameter(0).toEqualTypeOf<{ name: string; count: number }>()
    expectTypeOf(def.example).toEqualTypeOf<{ name: string; count: number }>()
    // Runtime sanity check.
    expect(def.subject({ name: 'Marie', count: 3 })).toBe('Marie x3')
  })
})

describe('manifest', () => {
  const defA: NotificationTypeDefinition<{ a: string }> = {
    type: 't.a',
    category: { key: 't', label: () => 't' },
    label: () => 'A',
    routing: { debounceMinutes: 0, recipientStrategy: 'role', recipientRole: 'r' },
    payload: z.object({ a: z.string() }),
    subject: () => 'a',
    renderEmail: () => null,
    example: { a: 'x' },
  }
  const defB: NotificationTypeDefinition<{ b: number }> = {
    type: 't.b',
    category: { key: 't', label: () => 't' },
    label: () => 'B',
    routing: { debounceMinutes: 0, recipientStrategy: 'role', recipientRole: 'r' },
    payload: z.object({ b: z.number() }),
    subject: () => 'b',
    renderEmail: () => null,
    example: { b: 1 },
  }

  it('returns its arguments as an unknown-typed array preserving order', () => {
    const arr = manifest(defA, defB)
    expect(arr).toHaveLength(2)
    expect(arr[0]).toBe(defA)
    expect(arr[1]).toBe(defB)
  })

  it('accepts heterogeneous payload generics without a cast at the call site', () => {
    // Compile-time: the two defs have different T; the helper types the array
    // as NotificationTypeDefinition<unknown>[] so downstream consumers can
    // iterate without narrowing to a union.
    const arr: NotificationTypeDefinition<unknown>[] = manifest(defA, defB)
    expect(arr.length).toBe(2)
  })
})

describe('defineNotificationType', () => {
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
