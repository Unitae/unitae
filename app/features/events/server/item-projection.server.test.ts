import { describe, expect, it, vi } from 'vitest'
import {
  asEventPart,
  asEventServicePart,
  itemIdFromRequest,
  itemKind,
  publicItemId,
  splitItems,
  templateItemsOf,
} from './item-projection.server'

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
  schedule: { kind: 'programme' },
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
  schedule: { kind: 'duty' },
}

describe('item projection', () => {
  it('tells a part from a duty by the kind of its schedule', () => {
    expect(itemKind(part)).toBe('part')
    expect(itemKind(service)).toBe('service')
  })

  it('takes the kind from the schedule, whatever row the item mirrors', () => {
    const moved = { ...part, schedule: { kind: 'duty' } }
    expect(itemKind(moved)).toBe('service')
    expect(splitItems([moved, service])).toEqual({ parts: [], services: [moved, service] })
  })

  it('refuses an item outside a schedule, which has no kind', () => {
    expect(() => itemKind({ schedule: null })).toThrow()
  })

  it("hands out the item's own id, never the old row's, mirrored or not (5i-b)", () => {
    expect(publicItemId(part)).toBe(900)
    const madeHere = { ...part, legacyPartId: null }
    expect(publicItemId(madeHere)).toBe(900)
  })

  it("splits items by kind, keeping each kind's order", () => {
    const second = { ...part, legacyPartId: 41 }
    expect(splitItems([part, service, second])).toEqual({ parts: [part, second], services: [service] })
  })

  it("reads a part as today's EventPart: the item's id and its template part's", () => {
    const { legacyPartId, legacyServiceId, templateItem, templateItemId, schedule, ...columns } = part
    expect(asEventPart(part)).toEqual({ ...columns, id: 900, partId: 4 })
  })

  it('reads an item the app made, which mirrors no old row, as one with its own id', () => {
    expect(asEventPart({ ...part, legacyPartId: null })).toMatchObject({ id: 900, partId: 4 })
    expect(asEventServicePart({ ...service, legacyServiceId: null })).toMatchObject({ id: 900 })
  })

  it("reads a duty as today's EventServicePart, without the programme's columns", () => {
    expect(asEventServicePart(service)).toEqual({
      id: 900,
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
    expect(asEventServicePart({ ...service, assignee })).toMatchObject({ id: 900, assignee })
    expect(asEventPart({ ...part, assignee, assistant: null })).toMatchObject({ id: 900, assignee, assistant: null })
  })
})

describe('itemIdFromRequest', () => {
  const db = (rows: { id: number; legacyPartId: number | null; legacyServiceId: number | null }[]) => ({
    item: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        rows.find(row =>
          'legacyPartId' in where
            ? row.legacyPartId === where.legacyPartId
            : row.legacyServiceId === where.legacyServiceId,
        ) ?? null,
    },
  })

  it('takes an item id posted under the new name as it is', async () => {
    expect(await itemIdFromRequest(db([]), { itemId: '12', legacyId: null }, 'part', 1)).toBe(12)
  })

  it("translates an old row's id posted under the old name, of its kind only", async () => {
    const rows = [{ id: 90, legacyPartId: 7, legacyServiceId: null }]
    expect(await itemIdFromRequest(db(rows), { itemId: null, legacyId: '7' }, 'part', 1)).toBe(90)
    expect(await itemIdFromRequest(db(rows), { itemId: null, legacyId: '7' }, 'service', 1)).toBeNull()
  })

  it('answers nothing for a missing or malformed id', async () => {
    expect(await itemIdFromRequest(db([]), { itemId: null, legacyId: null }, 'part', 1)).toBeNull()
    expect(await itemIdFromRequest(db([]), { itemId: 'x', legacyId: null }, 'part', 1)).toBeNull()
  })
})

describe('templateItemsOf', () => {
  const db = (rows: { id: number; legacyPartId: number | null; legacyServiceId: number | null }[]) => ({
    templateItem: { findMany: async () => rows },
  })

  it('maps each template part and service to the template item mirroring it', async () => {
    const rows = [
      { id: 501, legacyPartId: 4, legacyServiceId: null },
      { id: 502, legacyPartId: null, legacyServiceId: 4 },
    ]
    const { parts, services } = await templateItemsOf(db(rows), { partIds: [4], serviceIds: [4] }, 1)
    expect(parts.get(4)).toBe(501)
    expect(services.get(4)).toBe(502)
  })

  it('reads nothing for a template without items', async () => {
    const findMany = vi.fn()
    const result = await templateItemsOf({ templateItem: { findMany } }, { partIds: [], serviceIds: [] }, 1)
    expect(result.parts.size + result.services.size).toBe(0)
    expect(findMany).not.toHaveBeenCalled()
  })
})
