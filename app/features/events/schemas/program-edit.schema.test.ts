import { describe, expect, it } from 'vitest'
import { addPartSchema, NO_PRESET_VALUE, updatePartSchema } from './program-edit.schema'

// The two schemas share the same shape for optional per-part role labels, so
// the tests below hit both. Anything schema-wide (min/optional handling) is
// exercised via the other required fields elsewhere in the suite.

function baseAddInput() {
  return {
    intent: 'add-part',
    partName: 'Bible reading',
    partOrder: 1,
  }
}

function baseUpdateInput() {
  return {
    intent: 'update-part',
    partAssignmentId: 5,
    partName: 'Bible reading',
    partOrder: 1,
  }
}

describe('addPartSchema role labels (Layer 6)', () => {
  it('accepts a partSpeakerLabel and partReaderLabel and passes them through', () => {
    const parsed = addPartSchema.safeParse({
      ...baseAddInput(),
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
    const parsed = addPartSchema.safeParse(baseAddInput())

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.partSpeakerLabel).toBeUndefined()
      expect(parsed.data.partReaderLabel).toBeUndefined()
    }
  })

  it('trims leading/trailing whitespace on labels', () => {
    const parsed = addPartSchema.safeParse({
      ...baseAddInput(),
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
    const parsed = addPartSchema.safeParse({
      ...baseAddInput(),
      partSpeakerLabel: 'x'.repeat(51),
    })

    expect(parsed.success).toBe(false)
  })

  it('accepts labels at exactly 50 characters', () => {
    const parsed = addPartSchema.safeParse({
      ...baseAddInput(),
      partSpeakerLabel: 'x'.repeat(50),
    })

    expect(parsed.success).toBe(true)
  })

  // Locks the empty-string→undefined round-trip. The route action does
  // `partSpeakerLabel ?? null` to normalize, so undefined here becomes null
  // at the DB (i.e. "clear the value"). A regression that yielded '' instead
  // of undefined would slip an empty string into the DB and the label helper
  // would return '' (falsy) instead of the i18n default.
  it('coerces an empty-string input to undefined so the caller can normalize to null', () => {
    const parsed = addPartSchema.safeParse({
      ...baseAddInput(),
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

describe('updatePartSchema role labels (Layer 6)', () => {
  it('accepts and passes through both label fields', () => {
    const parsed = updatePartSchema.safeParse({
      ...baseUpdateInput(),
      partSpeakerLabel: 'Student',
      partReaderLabel: 'Householder',
    })

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.partSpeakerLabel).toBe('Student')
      expect(parsed.data.partReaderLabel).toBe('Householder')
    }
  })

  it('rejects labels longer than 50 characters', () => {
    const parsed = updatePartSchema.safeParse({
      ...baseUpdateInput(),
      partReaderLabel: 'y'.repeat(51),
    })

    expect(parsed.success).toBe(false)
  })
})

describe('part preset selection', () => {
  it.each([
    ['addPartSchema', addPartSchema, baseAddInput],
    ['updatePartSchema', updatePartSchema, baseUpdateInput],
  ] as const)('%s passes a chosen preset through as a number', (_name, schema, base) => {
    const parsed = schema.safeParse({ ...base(), partPresetId: '7' })

    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.partPresetId).toBe(7)
  })

  it.each([
    ['addPartSchema', addPartSchema, baseAddInput],
    ['updatePartSchema', updatePartSchema, baseUpdateInput],
  ] as const)('%s turns the empty "no kind" option into null, not 0', (_name, schema, base) => {
    // The <select> submits '' for the blank option. Coercing that to 0 would
    // write a dangling FK, so it has to become an explicit null.
    const parsed = schema.safeParse({ ...base(), partPresetId: '' })

    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.partPresetId).toBeNull()
  })

  it('treats an absent preset field as null rather than undefined', () => {
    // Absent means "no kind chosen", which must still clear a previously set
    // preset rather than silently leaving the old one in place.
    const parsed = addPartSchema.safeParse(baseAddInput())

    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.partPresetId).toBeNull()
  })

  it('treats the Radix "none" sentinel as no preset', () => {
    // Radix forbids an empty-string item value, so the blank option submits
    // this instead. Coercing it would fail and reject an entirely valid form.
    const parsed = addPartSchema.safeParse({ ...baseAddInput(), partPresetId: NO_PRESET_VALUE })

    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.partPresetId).toBeNull()
  })

  it('rejects a non-numeric preset id', () => {
    const parsed = addPartSchema.safeParse({ ...baseAddInput(), partPresetId: 'not-an-id' })

    expect(parsed.success).toBe(false)
  })
})
