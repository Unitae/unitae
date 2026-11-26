import { describe, expect, it } from 'vitest'
import { PartPresetKey } from './part-preset.type'
import {
  buildStudentSlip,
  isStudentSlipPart,
  type SlipEvent,
  type SlipPart,
  slipPartNumber,
  slipRoomIndex,
} from './student-slip'

const member = { firstname: 'Marc', lastname: 'Dupont' }

function part(overrides: Partial<SlipPart> & { id: number }): SlipPart {
  return {
    name: 'Partie',
    section: 'Appliquons-nous au ministère',
    order: overrides.id,
    track: '',
    trackOrder: null,
    assigneeId: 7,
    assignee: member,
    assistant: null,
    externalSpeaker: null,
    preset: null,
    ...overrides,
  }
}

function event(overrides: Partial<SlipEvent> = {}): SlipEvent {
  return {
    startDate: new Date('2026-11-10T18:00:00Z'),
    template: { attendanceKind: 'midweek' },
    schedules: [{ kind: 'programme', status: 'published' }],
    eventParts: [],
    ...overrides,
  }
}

describe('isStudentSlipPart', () => {
  it('accepts a member given a student part of a published midweek programme', () => {
    expect(isStudentSlipPart(part({ id: 1 }), event())).toBe(true)
    expect(isStudentSlipPart(part({ id: 2, preset: { key: PartPresetKey.BibleReading } }), event())).toBe(true)
    expect(isStudentSlipPart(part({ id: 3, preset: { key: PartPresetKey.SchoolDemonstration } }), event())).toBe(true)
  })

  it('refuses a weekend meeting, a draft programme and a part with nobody in it', () => {
    expect(isStudentSlipPart(part({ id: 1 }), event({ template: { attendanceKind: 'weekend' } }))).toBe(false)
    expect(isStudentSlipPart(part({ id: 1 }), event({ schedules: [{ kind: 'programme', status: 'draft' }] }))).toBe(
      false,
    )
    expect(isStudentSlipPart(part({ id: 1, assigneeId: null, assignee: null }), event())).toBe(false)
  })

  it('refuses a part outside every named section, which the programme does not number', () => {
    expect(isStudentSlipPart(part({ id: 1, section: '' }), event())).toBe(false)
  })

  it('refuses an external speaker and the kinds that are not a student’s', () => {
    expect(isStudentSlipPart(part({ id: 1, externalSpeaker: { id: 4 } }), event())).toBe(false)
    for (const key of [
      PartPresetKey.Prayer,
      PartPresetKey.Chairman,
      PartPresetKey.MidweekTalk,
      PartPresetKey.CongregationBibleStudy,
    ]) {
      expect(isStudentSlipPart(part({ id: 1, preset: { key } }), event())).toBe(false)
    }
  })

  // The ministry parts have no kind on purpose (it changes every week), but neither do other parts: a part without a
  // kind is a student's only in the ministry section, whatever language its title is in.
  it('takes a part without a kind for a student’s only in the ministry section', () => {
    for (const section of [
      'Appliquons-nous au ministère',
      'Apply Yourself to the Field Ministry',
      'Empenhe-se no Ministério',
    ]) {
      expect(isStudentSlipPart(part({ id: 1, section }), event())).toBe(true)
    }
    for (const section of [
      'Joyaux de la parole de Dieu',
      'Joyaux spirituels',
      'Vie chrétienne',
      'Living as Christians',
    ]) {
      expect(isStudentSlipPart(part({ id: 1, section }), event())).toBe(false)
    }
  })

  it('keeps the Bible reading, whose kind says it, in the treasures section', () => {
    const reading = part({ id: 1, section: 'Joyaux spirituels', preset: { key: PartPresetKey.BibleReading } })
    expect(isStudentSlipPart(reading, event())).toBe(true)
  })
})

describe('slipPartNumber', () => {
  // The seeded midweek programme: the song and the opening prayer have no section and take no number.
  const programme: SlipPart[] = [
    part({ id: 10, name: 'Prière', section: '', order: 1 }),
    part({ id: 11, name: 'Discours', section: 'Trésors', order: 2, preset: { key: PartPresetKey.MidweekTalk } }),
    part({ id: 12, name: 'Perles', section: 'Trésors', order: 3, preset: { key: PartPresetKey.MidweekTalk } }),
    part({ id: 13, name: 'Lecture', section: 'Trésors', order: 4, preset: { key: PartPresetKey.BibleReading } }),
    part({ id: 14, name: 'Première partie', section: 'Ministère', order: 5 }),
    part({ id: 17, name: 'Deuxième partie', section: 'Ministère', order: 6 }),
    part({ id: 18, name: 'Troisième partie', section: 'Ministère', order: 7 }),
    part({ id: 15, name: 'Chant', section: '', order: 8 }),
    part({ id: 16, name: 'Vie 1', section: 'Vie chrétienne', order: 9, preset: { key: PartPresetKey.MidweekTalk } }),
  ]

  it('numbers the parts of a named section in order, the song and prayer aside', () => {
    expect(slipPartNumber(programme, 13)).toBe(3)
    expect(slipPartNumber(programme, 14)).toBe(4)
    expect(slipPartNumber(programme, 16)).toBe(7)
  })

  it('leaves unnumbered parts without a number', () => {
    expect(slipPartNumber(programme, 10)).toBeNull()
    expect(slipPartNumber(programme, 15)).toBeNull()
  })

  it('counts a part held in several rooms once, and gives every room the same number', () => {
    const rooms: SlipPart[] = [
      part({ id: 20, name: 'Lecture', section: 'Trésors', order: 1, track: '', trackOrder: 1 }),
      part({ id: 21, name: 'Lecture', section: 'Trésors', order: 1, track: 'Deuxième salle', trackOrder: 2 }),
      part({ id: 22, name: 'Ministère', section: 'Ministère', order: 2 }),
    ]
    expect(slipPartNumber(rooms, 20)).toBe(1)
    expect(slipPartNumber(rooms, 21)).toBe(1)
    expect(slipPartNumber(rooms, 22)).toBe(2)
  })
})

describe('slipRoomIndex', () => {
  it('reads the main room from an untracked part or the first track', () => {
    expect(slipRoomIndex(part({ id: 1 }))).toBe(0)
    expect(slipRoomIndex(part({ id: 1, track: 'Salle principale', trackOrder: 1 }))).toBe(0)
  })

  it('reads the second and third rooms, and nothing beyond', () => {
    expect(slipRoomIndex(part({ id: 1, track: 'Deuxième salle', trackOrder: 2 }))).toBe(1)
    expect(slipRoomIndex(part({ id: 1, track: 'Troisième salle', trackOrder: 3 }))).toBe(2)
    expect(slipRoomIndex(part({ id: 1, track: 'Quatrième', trackOrder: 4 }))).toBeNull()
  })
})

describe('buildStudentSlip', () => {
  it('fills the name, the assistant, the date in the congregation’s time zone and the part number', () => {
    const lecture = part({
      id: 13,
      name: 'Lecture',
      section: 'Trésors',
      order: 4,
      assistant: { firstname: 'Léa', lastname: 'Martin' },
    })
    const slip = buildStudentSlip({
      event: event({ eventParts: [lecture] }),
      part: lecture,
      parts: [lecture],
      timezone: 'Europe/Paris',
      locale: 'fr',
    })

    expect(slip.name).toBe('Marc Dupont')
    expect(slip.assistant).toBe('Léa Martin')
    expect(slip.date).toContain('10')
    expect(slip.partNumber).toBe(1)
    expect(slip.room).toBe(0)
  })

  it('leaves the assistant empty when the part has none', () => {
    const solo = part({ id: 1 })
    const slip = buildStudentSlip({ event: event(), part: solo, parts: [solo], timezone: 'Europe/Paris', locale: 'fr' })
    expect(slip.assistant).toBeNull()
  })
})
