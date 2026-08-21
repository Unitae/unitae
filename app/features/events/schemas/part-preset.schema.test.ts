import { describe, expect, it } from 'vitest'
import { partPresetSchema } from './part-preset.schema'

function base(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Discours de circonscription',
    speakerLabel: 'Orateur',
    shareMessage: 'Bonjour {{assigneeFirstname}}, tu as {{partName}} le {{date}}.',
    ...overrides,
  }
}

describe('partPresetSchema', () => {
  it('accepts a well-formed preset', () => {
    expect(partPresetSchema.safeParse(base()).success).toBe(true)
  })

  it('requires a name', () => {
    expect(partPresetSchema.safeParse(base({ name: '' })).success).toBe(false)
  })

  it('requires a share message — a preset with none has nothing to send', () => {
    expect(partPresetSchema.safeParse(base({ shareMessage: '   ' })).success).toBe(false)
  })

  it('rejects an unknown variable and names it', () => {
    // The whole point of validating here: a typo would otherwise render as a
    // silent gap in a message already sent to someone.
    const parsed = partPresetSchema.safeParse(base({ shareMessage: 'Salut {{prenom}} !' }))

    expect(parsed.success).toBe(false)
    expect(JSON.stringify(parsed.error?.issues)).toContain('prenom')
  })

  it('reports every unknown variable, not just the first', () => {
    const parsed = partPresetSchema.safeParse(base({ shareMessage: '{{nope}} {{alsoNope}}' }))

    const message = JSON.stringify(parsed.error?.issues)
    expect(message).toContain('nope')
    expect(message).toContain('alsoNope')
  })

  it('tells the author which variables are available, not just what is wrong', () => {
    const parsed = partPresetSchema.safeParse(base({ shareMessage: '{{nope}}' }))

    const message = parsed.error?.issues[0]?.message ?? ''
    expect(message).toContain('{{nope}}')
    expect(message).toContain('{{assigneeFirstname}}')
  })

  it('accepts every documented variable', () => {
    const all =
      '{{assignee}} {{assigneeFirstname}} {{assistant}} {{partName}} {{section}} {{topic}} {{duration}} {{date}} {{time}} {{eventName}} {{note}} {{congregation}} {{link}}'

    expect(partPresetSchema.safeParse(base({ shareMessage: all }).valueOf() as object).success).toBe(true)
  })

  it('treats the checkboxes as off when absent', () => {
    const parsed = partPresetSchema.safeParse(base())

    expect(parsed.success && parsed.data.hasReaderSlot).toBe(false)
    expect(parsed.success && parsed.data.allowExternalSpeaker).toBe(false)
  })

  it('reads a checked checkbox', () => {
    const parsed = partPresetSchema.safeParse(base({ hasReaderSlot: 'on', allowExternalSpeaker: 'on' }))

    expect(parsed.success && parsed.data.hasReaderSlot).toBe(true)
    expect(parsed.success && parsed.data.allowExternalSpeaker).toBe(true)
  })

  it('turns a blank slot label into null so the i18n default surfaces', () => {
    const parsed = partPresetSchema.safeParse(base({ speakerLabel: '   ', readerLabel: '' }))

    expect(parsed.success && parsed.data.speakerLabel).toBeNull()
    expect(parsed.success && parsed.data.readerLabel).toBeNull()
  })
})
