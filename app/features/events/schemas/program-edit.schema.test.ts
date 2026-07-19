import { describe, expect, it } from 'vitest'
import { addPartSchema, updatePartSchema } from './program-edit.schema'

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
