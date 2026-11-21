import { describe, expect, it } from 'vitest'
import { asEventPart, asEventServicePart, itemKind, splitItems } from './item-projection'

const base = {
  id: 900,
  name: 'Lecture',
  order: 2,
  topic: 'Matthieu 5',
  note: '',
  hasConflict: false,
  section: 'Joyaux',
  track: '',
  trackOrder: null,
  durationMin: 4,
  speakerLabel: null,
  readerLabel: 'Lecteur',
  eventId: 7,
  scheduleId: 70,
  templateItemId: 500,
  presetId: 3,
  assigneeId: 11,
  assistantId: 12,
  allowExternalSpeaker: false,
  externalSpeakerId: null,
  createdAt: new Date('2026-11-01T00:00:00Z'),
  updatedAt: new Date('2026-11-02T00:00:00Z'),
  congregationId: 1,
}
const part = {
  ...base,
  legacyPartId: 40,
  legacyServiceId: null,
  templateItem: { legacyPartId: 4, legacyServiceId: null },
}
const service = {
  ...base,
  name: 'Sono',
  topic: '',
  section: '',
  durationMin: null,
  readerLabel: null,
  assistantId: null,
  legacyPartId: null,
  legacyServiceId: 60,
  templateItem: null,
}

describe('item projection', () => {
  it('tells a part from a duty by the row it mirrors', () => {
    expect(itemKind(part)).toBe('part')
    expect(itemKind(service)).toBe('service')
  })

  it('refuses an item that mirrors no row, which no reader can name yet', () => {
    expect(() => itemKind({ legacyPartId: null, legacyServiceId: null })).toThrow()
  })

  it("splits items by kind, keeping each kind's order", () => {
    const second = { ...part, legacyPartId: 41 }
    expect(splitItems([part, service, second])).toEqual({ parts: [part, second], services: [service] })
  })

  it("reads a part as today's EventPart: its own id and its template part's", () => {
    const { legacyPartId, legacyServiceId, templateItem, templateItemId, ...columns } = part
    expect(asEventPart(part)).toEqual({ ...columns, id: 40, partId: 4 })
  })

  it("reads a duty as today's EventServicePart, without the programme's columns", () => {
    expect(asEventServicePart(service)).toEqual({
      id: 60,
      servicePartId: null,
      name: 'Sono',
      order: 2,
      note: '',
      hasConflict: false,
      eventId: 7,
      scheduleId: 70,
      presetId: 3,
      assigneeId: 11,
      createdAt: service.createdAt,
      updatedAt: service.updatedAt,
      congregationId: 1,
    })
  })

  it("puts today's columns in today's order, the relations after them", () => {
    const projected = asEventPart({ ...part, assignee: null })
    expect(Object.keys(projected).slice(0, 3)).toEqual(['id', 'topic', 'note'])
    expect(Object.keys(projected).at(-1)).toBe('assignee')
  })

  it('keeps the relations a reader included', () => {
    const assignee = { id: 11, firstname: 'Paul' }
    expect(asEventServicePart({ ...service, assignee })).toMatchObject({ id: 60, assignee })
    expect(asEventPart({ ...part, assignee, assistant: null })).toMatchObject({ id: 40, assignee, assistant: null })
  })
})
