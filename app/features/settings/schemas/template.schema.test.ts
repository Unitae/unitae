import { describe, expect, it } from 'vitest'
import { upsertPartSchema } from './template.schema'

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
})
