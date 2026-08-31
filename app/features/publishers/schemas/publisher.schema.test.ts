import { describe, expect, it } from 'vitest'
import { updatePublisherSchema } from './edit-publisher.schema'
import { createPublisherSchema } from './publisher.schema'

const baseInput = {
  firstname: 'Jean',
  lastname: 'Dupont',
  gender: 'male' as const,
}

// The pioneer type is not a member field any more — it is an enrolment, appointed from the pioneer
// section of the edit page. Both forms must parse without one, and must not smuggle one back in.
describe.each([
  ['createPublisherSchema', createPublisherSchema],
  ['updatePublisherSchema', updatePublisherSchema],
])('%s — no pioneer type', (_name, schema) => {
  it('parses without a type field', () => {
    const result = schema.safeParse(baseInput)
    expect(result.success).toBe(true)
  })

  it('does not carry a type through to the parsed value', () => {
    const result = schema.safeParse({ ...baseInput, type: 'pionnier-permanant' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).not.toHaveProperty('type')
  })
})

describe.each([
  ['createPublisherSchema', createPublisherSchema],
  ['updatePublisherSchema', updatePublisherSchema],
])('%s — phone validation', (_name, schema) => {
  it('accepts an empty phone (optional)', () => {
    const result = schema.safeParse({ ...baseInput, phone: '' })
    expect(result.success).toBe(true)
  })

  it('accepts an omitted phone (defaults to empty)', () => {
    const result = schema.safeParse(baseInput)
    expect(result.success).toBe(true)
  })

  it('accepts a French local-format number', () => {
    const result = schema.safeParse({ ...baseInput, phone: '06 12 34 56 78' })
    expect(result.success).toBe(true)
  })

  it('accepts an international E.164 number', () => {
    const result = schema.safeParse({ ...baseInput, phone: '+33612345678' })
    expect(result.success).toBe(true)
  })

  it('accepts a phone with dashes and parentheses', () => {
    const result = schema.safeParse({ ...baseInput, phone: '+1 (555) 123-4567' })
    expect(result.success).toBe(true)
  })

  it('rejects a phone containing letters', () => {
    const result = schema.safeParse({ ...baseInput, phone: 'hello world' })
    expect(result.success).toBe(false)
  })

  it('rejects a phone shorter than 6 digits worth of characters', () => {
    const result = schema.safeParse({ ...baseInput, phone: '123' })
    expect(result.success).toBe(false)
  })

  it('rejects an implausibly long phone (>20 characters)', () => {
    const result = schema.safeParse({ ...baseInput, phone: '1234567890123456789012345' })
    expect(result.success).toBe(false)
  })

  it('rejects a phone containing punctuation other than allowed separators', () => {
    const result = schema.safeParse({ ...baseInput, phone: '+33/6-12-34-56-78' })
    expect(result.success).toBe(false)
  })
})

describe.each([
  ['createPublisherSchema', createPublisherSchema],
  ['updatePublisherSchema', updatePublisherSchema],
])('%s — name normalization', (_name, schema) => {
  it('rejects an empty firstname', () => {
    const result = schema.safeParse({ ...baseInput, firstname: '' })
    expect(result.success).toBe(false)
  })

  it('rejects a firstname that is only whitespace', () => {
    const result = schema.safeParse({ ...baseInput, firstname: '   ' })
    expect(result.success).toBe(false)
  })

  it('trims leading and trailing whitespace on firstname', () => {
    const result = schema.safeParse({ ...baseInput, firstname: '  Marie  ' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.firstname).toBe('Marie')
  })

  it('trims leading and trailing whitespace on lastname', () => {
    const result = schema.safeParse({ ...baseInput, lastname: '\tDupont\t' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.lastname).toBe('Dupont')
  })

  it('accepts hyphens and apostrophes in names', () => {
    const result = schema.safeParse({ ...baseInput, firstname: 'Jean-Claude', lastname: "O'Brien" })
    expect(result.success).toBe(true)
  })

  it('accepts diacritics in names', () => {
    const result = schema.safeParse({ ...baseInput, firstname: 'Zoé', lastname: 'Müller' })
    expect(result.success).toBe(true)
  })

  it('rejects a firstname longer than 100 characters', () => {
    const result = schema.safeParse({ ...baseInput, firstname: 'a'.repeat(101) })
    expect(result.success).toBe(false)
  })

  it('rejects a lastname longer than 100 characters', () => {
    const result = schema.safeParse({ ...baseInput, lastname: 'b'.repeat(101) })
    expect(result.success).toBe(false)
  })

  it('accepts a firstname exactly at the 100-character boundary', () => {
    const result = schema.safeParse({ ...baseInput, firstname: 'a'.repeat(100) })
    expect(result.success).toBe(true)
  })
})
