import { parseWithZod } from '@conform-to/zod/v4'
import { describe, expect, it } from 'vitest'
import { ourSpeakerIntentSchema } from './our-speaker.schema'

function parse(entries: [string, string][]) {
  const form = new FormData()
  for (const [name, value] of entries) form.append(name, value)
  return parseWithZod(form, { schema: ourSpeakerIntentSchema })
}

function accepted(entries: [string, string][]) {
  const result = parse(entries)
  if (result.status !== 'success') throw new Error(`Refused: ${JSON.stringify(result.error)}`)
  return result.value
}

function refusalOf(entries: [string, string][]) {
  const result = parse(entries)
  return result.status === 'success' ? null : result.error
}

const brother: [string, string][] = [
  ['intent', 'brother-update'],
  ['memberId', '12'],
  ['onList', 'on'],
  ['talks', '141'],
  ['talks', '4'],
  ['phoneMode', 'record'],
  ['phoneCustom', ''],
  ['emailMode', 'custom'],
  ['emailCustom', 'discours.lilas@exemple.fr'],
  ['note', ' Pas disponible en décembre '],
]

describe('ourSpeakerIntentSchema', () => {
  it('reads a brother’s entry from his panel: the switch, the talk tokens, the contact choices', () => {
    expect(accepted(brother)).toMatchObject({
      memberId: 12,
      onList: true,
      talks: [141, 4],
      emailMode: 'custom',
      emailCustom: 'discours.lilas@exemple.fr',
      note: 'Pas disponible en décembre',
    })
  })

  it('reads an unticked switch as off the list', () => {
    expect(accepted(brother.filter(([name]) => name !== 'onList'))).toMatchObject({ onList: false })
  })

  it('refuses « Un autre numéro » left blank, which would share nothing', () => {
    const error = refusalOf([...brother.filter(([name]) => name !== 'phoneMode'), ['phoneMode', 'custom']])

    expect(error?.phoneCustom).toBeDefined()
  })

  it('reads one ticked congregation or several, and refuses none', () => {
    const send = (ids: string[]): [string, string][] => [
      ['intent', 'send'],
      ...ids.map(id => ['speakerCongregationIds', id] as [string, string]),
      ['subject', 'Notre liste'],
      ['message', 'Bonjour'],
    ]

    expect(accepted(send(['3']))).toMatchObject({ speakerCongregationIds: [3] })
    expect(accepted(send(['3', '4']))).toMatchObject({ speakerCongregationIds: [3, 4], copyCoordinators: false })
    expect(refusalOf(send([]))?.speakerCongregationIds).toBeDefined()
  })

  it('reads the day a list was marked sent', () => {
    const value = accepted([
      ['intent', 'mark-sent'],
      ['speakerCongregationIds', '3'],
      ['sentOn', '2026-11-11'],
    ])

    expect(value).toMatchObject({ sentOn: '2026-11-11' })
  })
})
