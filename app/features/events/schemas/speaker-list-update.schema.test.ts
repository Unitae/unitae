import { describe, expect, it } from 'vitest'
import { speakerListUpdateSchema } from './speaker-list-update.schema'

const contacts = {
  responsibleName: 'Paul LEROY',
  responsiblePhone: '',
  responsibleEmail: 'discours.bagnolet@exemple.fr',
  coordinatorName: '',
  coordinatorPhone: '',
  coordinatorEmail: '',
}
const fields = { name: 'Arnaud PICARD', phone: '06 27 73 50 14', phone2: '', email: '', email2: '', talks: [25, 64] }

describe('speakerListUpdateSchema', () => {
  it('reads the posted list: its date, the two contacts and every change', () => {
    const result = speakerListUpdateSchema.safeParse({
      listDate: '2026-11-03',
      contacts,
      rows: [
        { kind: 'create', fields },
        { kind: 'update', speakerId: 1, fields: { ...fields, name: 'Paul LEROY' } },
        { kind: 'move', speakerId: 9, fields: { ...fields, name: 'Olivier LAMBERT' } },
        { kind: 'retire', speakerId: 3 },
      ],
    })
    expect(result.success && result.data.listDate).toEqual(new Date('2026-11-03T00:00:00.000Z'))
    expect(result.success && result.data.rows).toHaveLength(4)
  })

  it('reads a list without a date', () => {
    const result = speakerListUpdateSchema.safeParse({ listDate: '', contacts, rows: [] })
    expect(result.success && result.data.listDate).toBeNull()
  })

  it('refuses a speaker nobody can reach, and a row without a name', () => {
    const unreachable = { ...fields, phone: '' }
    expect(
      speakerListUpdateSchema.safeParse({ listDate: '', contacts, rows: [{ kind: 'create', fields: unreachable }] })
        .success,
    ).toBe(false)
    expect(
      speakerListUpdateSchema.safeParse({
        listDate: '',
        contacts,
        rows: [{ kind: 'create', fields: { ...fields, name: ' ' } }],
      }).success,
    ).toBe(false)
  })
})
