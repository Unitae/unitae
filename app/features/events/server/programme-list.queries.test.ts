import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: { event: { findMany: vi.fn(), findFirst: vi.fn() } },
}))

const { congregationHasProgrammes, listProgrammes } = await import('./programme-list.queries')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

const FROM = new Date('2026-11-08T23:00:00Z')
const TO = new Date('2026-12-31T22:59:59.999Z')
// The rows the items read as (plan T12): a part or a service by the kind of its schedule.
const part = (assigneeId: number | null, externalSpeakerId: number | null = null, hasConflict = false) => ({
  schedule: { kind: 'programme' },
  assigneeId,
  externalSpeakerId,
  hasConflict,
  // Its one room, as every part has since R1 (parallel rooms).
  rooms: [{ assigneeId, externalSpeakerId, hasConflict }],
})
const service = (assigneeId: number | null, hasConflict = false) => ({
  schedule: { kind: 'duty' },
  assigneeId,
  externalSpeakerId: null,
  hasConflict,
})

beforeEach(() => vi.resetAllMocks())

describe('listProgrammes', () => {
  // Filled as the programme's page counts it: a part with someone in its main slot, a person or an external speaker.
  it('counts the parts and services filled and flagged, for the list to show without their rows', async () => {
    vi.mocked(db.event.findMany).mockResolvedValue([
      {
        id: 31,
        name: 'Réunion de semaine',
        startDate: new Date('2026-11-12T18:00:00Z'),
        endDate: new Date('2026-11-12T19:45:00Z'),
        status: 'released',
        templateId: 4,
        template: {
          name: 'Réunion de semaine',
          color: '#3b82f6',
          key: 'midweek-meeting',
          scheduleTemplates: [{ scheduleTemplate: { _count: { parts: 12, serviceParts: 4 } } }],
        },
        items: [part(5), service(9), part(null, 2), part(null), service(null), part(7, null, true), service(5, true)],
      },
    ] as never)

    const [programme] = await listProgrammes(db, { congregationId: 1, from: FROM, to: TO })

    expect(programme).toEqual({
      id: 31,
      name: 'Réunion de semaine',
      startDate: new Date('2026-11-12T18:00:00Z'),
      endDate: new Date('2026-11-12T19:45:00Z'),
      status: 'released',
      templateId: 4,
      kind: { name: 'Réunion de semaine', color: '#3b82f6' },
      parts: { total: 4, filled: 3, flagged: 1 },
      services: { total: 3, filled: 2, flagged: 1 },
      awaitingProgramme: false,
    })
  })

  // The recurring-events job creates the meetings ahead; their programme comes later.
  it('says which meetings are still waiting for their programme, never another event', async () => {
    const empty = { startDate: new Date(), endDate: new Date(), status: 'draft', items: [] }
    vi.mocked(db.event.findMany).mockResolvedValue([
      {
        ...empty,
        id: 1,
        name: 'Réunion',
        templateId: 4,
        template: {
          name: 'R',
          color: '#000',
          key: null,
          scheduleTemplates: [{ scheduleTemplate: { _count: { parts: 12, serviceParts: 4 } } }],
        },
      },
      {
        ...empty,
        id: 2,
        name: 'Nettoyage',
        templateId: 9,
        template: {
          name: 'A',
          color: '#000',
          key: 'freeform',
          scheduleTemplates: [{ scheduleTemplate: { _count: { parts: 0, serviceParts: 0 } } }],
        },
      },
    ] as never)

    const rows = await listProgrammes(db, { congregationId: 1, from: FROM, to: TO })

    expect(rows.map(row => row.awaitingProgramme)).toEqual([true, false])
    expect(rows[0]?.kind).toEqual({ name: 'R', color: '#000' })
  })

  it('names no kind for a programme without a template', async () => {
    vi.mocked(db.event.findMany).mockResolvedValue([
      {
        id: 40,
        name: 'Nettoyage',
        startDate: new Date('2026-11-28T08:00:00Z'),
        endDate: new Date('2026-11-28T11:00:00Z'),
        status: 'draft',
        templateId: null,
        template: null,
        items: [],
      },
    ] as never)

    const [programme] = await listProgrammes(db, { congregationId: 1, from: FROM, to: TO })

    expect(programme).toMatchObject({ kind: null, parts: { total: 0, filled: 0, flagged: 0 } })
  })
})

describe('congregationHasProgrammes', () => {
  it('answers whether a programme exists, drafts counted only when asked', async () => {
    vi.mocked(db.event.findFirst).mockImplementation((({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(where.OR == null ? { id: 1 } : null)) as never)

    expect(await congregationHasProgrammes(db, 1, { withDrafts: true })).toBe(true)
    expect(await congregationHasProgrammes(db, 1, { withDrafts: false })).toBe(false)
  })
})
