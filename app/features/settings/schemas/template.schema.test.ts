import { describe, expect, it } from 'vitest'
import { updateTemplateSchema, upsertPartSchema } from './template.schema'

function baseInput() {
  return {
    intent: 'upsert-part',
    partName: 'Bible reading',
    partOrder: 1,
  }
}

describe('upsertPartSchema role labels (Layer 6)', () => {
  it('accepts and passes through both label fields', () => {
    const parsed = upsertPartSchema.safeParse({
      ...baseInput(),
      partSpeakerLabel: 'Student',
      partReaderLabel: 'Householder',
    })

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.partSpeakerLabel).toBe('Student')
      expect(parsed.data.partReaderLabel).toBe('Householder')
    }
  })

  it('accepts a missing label and yields undefined', () => {
    const parsed = upsertPartSchema.safeParse(baseInput())

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.partSpeakerLabel).toBeUndefined()
      expect(parsed.data.partReaderLabel).toBeUndefined()
    }
  })

  it('trims leading/trailing whitespace on labels', () => {
    const parsed = upsertPartSchema.safeParse({
      ...baseInput(),
      partSpeakerLabel: '  Student  ',
      partReaderLabel: '\tHouseholder\n',
    })

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.partSpeakerLabel).toBe('Student')
      expect(parsed.data.partReaderLabel).toBe('Householder')
    }
  })

  it('rejects labels longer than 50 characters', () => {
    const parsed = upsertPartSchema.safeParse({
      ...baseInput(),
      partSpeakerLabel: 'x'.repeat(51),
    })

    expect(parsed.success).toBe(false)
  })

  // Same round-trip contract as program-edit.schema: empty-string collapses to
  // undefined so the caller's `?? null` normalization produces DB NULL (clear
  // the value) rather than storing '' (which would look "set" but read empty).
  it('coerces an empty-string input to undefined so the caller can normalize to null', () => {
    const parsed = upsertPartSchema.safeParse({
      ...baseInput(),
      partSpeakerLabel: '',
      partReaderLabel: '',
    })

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.partSpeakerLabel).toBeUndefined()
      expect(parsed.data.partReaderLabel).toBeUndefined()
    }
  })
})

describe('updateTemplateSchema', () => {
  // Documented in the schema itself; this locks the shape.
  it('accepts a payload with only intent + color (system template case)', () => {
    const parsed = updateTemplateSchema.safeParse({
      intent: 'update-template',
      color: '#abcdef',
    })

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.color).toBe('#abcdef')
      expect(parsed.data.name).toBeUndefined()
      expect(parsed.data.startTime).toBeUndefined()
      expect(parsed.data.endTime).toBeUndefined()
    }
  })

  it('still accepts the full editable-template payload', () => {
    const parsed = updateTemplateSchema.safeParse({
      intent: 'update-template',
      name: 'Réunion',
      weekDay: '3',
      color: '#123456',
      startTime: '19:00',
      endTime: '21:00',
    })

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.name).toBe('Réunion')
      expect(parsed.data.weekDay).toBe(3)
      expect(parsed.data.startTime).toBe('19:00')
      expect(parsed.data.endTime).toBe('21:00')
    }
  })

  // The "none" sentinel is the UI's way to clear the day-of-week binding —
  // the transform must map it to explicit null so Prisma writes NULL rather
  // than skipping the field.
  it("maps weekDay='none' to null", () => {
    const parsed = updateTemplateSchema.safeParse({
      intent: 'update-template',
      name: 'Réunion',
      weekDay: 'none',
      color: '#123456',
      startTime: '19:00',
      endTime: '21:00',
    })

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.weekDay).toBeNull()
    }
  })

  // An omitted weekDay must yield undefined (not null) so the service treats
  // it as "no change" rather than clearing an existing binding.
  it('omits weekDay when the field is missing or empty', () => {
    const parsed = updateTemplateSchema.safeParse({
      intent: 'update-template',
      color: '#abcdef',
    })

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.weekDay).toBeUndefined()
    }
  })

  it('rejects an empty name when one is provided', () => {
    const parsed = updateTemplateSchema.safeParse({
      intent: 'update-template',
      name: '',
      color: '#123456',
      startTime: '19:00',
      endTime: '21:00',
    })

    expect(parsed.success).toBe(false)
  })

  it('rejects a malformed time', () => {
    const parsed = updateTemplateSchema.safeParse({
      intent: 'update-template',
      name: 'Réunion',
      color: '#123456',
      startTime: 'nope',
      endTime: '21:00',
    })

    expect(parsed.success).toBe(false)
  })
})
