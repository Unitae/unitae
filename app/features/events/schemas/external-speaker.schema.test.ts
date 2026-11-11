import { describe, expect, it } from 'vitest'
import { externalSpeakerIntentSchema } from './external-speaker.schema'

function parse(fields: Record<string, unknown>) {
  return externalSpeakerIntentSchema.safeParse(fields)
}

const speaker = { name: ' Paul LEROY ', speakerCongregationId: '8', phone: '06 12 34 56 78' }

describe('external-speaker intents', () => {
  it('reads a new speaker with talks from the token field’s repeated inputs', () => {
    const result = parse({ intent: 'speaker-create', ...speaker, talks: ['12', '54', '102'] })
    expect(result.success && result.data).toMatchObject({
      intent: 'speaker-create',
      name: 'Paul LEROY',
      speakerCongregationId: 8,
      talks: [12, 54, 102],
      phone2: '',
      email2: '',
    })
  })

  it('reads typed talks however they are separated', () => {
    const result = parse({ intent: 'speaker-create', ...speaker, talks: '12, 54 102;131' })
    expect(result.success && result.data).toMatchObject({ talks: [12, 54, 102, 131] })
  })

  it('reads an empty congregation as none, the legacy « à compléter » case', () => {
    const result = parse({ intent: 'speaker-update', speakerId: '3', ...speaker, speakerCongregationId: '' })
    expect(result.success && result.data).toMatchObject({ speakerId: 3, speakerCongregationId: null })
  })

  it('refuses a speaker nobody can reach', () => {
    const result = parse({ intent: 'speaker-create', name: 'Paul LEROY', speakerCongregationId: '8' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['phone'])
  })

  it('accepts a speaker reachable by a second e-mail only', () => {
    const result = parse({
      intent: 'speaker-create',
      name: 'Paul LEROY',
      speakerCongregationId: '8',
      email2: 'discours@exemple.fr',
    })
    expect(result.success).toBe(true)
  })

  it('refuses a new speaker without a congregation, but lets a legacy record keep none', () => {
    const created = parse({ intent: 'speaker-create', ...speaker, speakerCongregationId: '' })
    expect(created.success).toBe(false)
    expect(created.error?.issues[0]?.path).toEqual(['speakerCongregationId'])
    expect(parse({ intent: 'speaker-update', speakerId: '3', ...speaker, speakerCongregationId: '' }).success).toBe(
      true,
    )
  })

  it('refuses a malformed e-mail and a talk that is not a number', () => {
    expect(parse({ intent: 'speaker-create', ...speaker, email: 'paul@' }).success).toBe(false)
    expect(parse({ intent: 'speaker-create', ...speaker, talks: '12, abc' }).success).toBe(false)
  })

  it('reads a new congregation that goes on to its list import', () => {
    const result = parse({ intent: 'congregation-create', name: ' Noisy-le-Sec ', next: 'update' })
    expect(result.success && result.data).toMatchObject({ name: 'Noisy-le-Sec', responsibleName: '', next: 'update' })
  })

  it('refuses a congregation without a name', () => {
    expect(parse({ intent: 'congregation-create', name: '  ' }).success).toBe(false)
  })

  it('reads the one-click actions', () => {
    for (const intent of ['speaker-retire', 'speaker-restore', 'speaker-delete']) {
      expect(parse({ intent, speakerId: '7' }).success).toBe(true)
    }
    expect(parse({ intent: 'congregation-delete', speakerCongregationId: '8' }).success).toBe(true)
  })
})
