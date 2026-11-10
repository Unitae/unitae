import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    eventTemplate: { findMany: vi.fn() },
    event: { findMany: vi.fn(), groupBy: vi.fn() },
  },
}))

const { getProgrammeCreationData } = await import('./programme-creation.queries')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

const MARTINIQUE = 'America/Martinique'

function template(id: number, name: string, weekDay: number | null) {
  return {
    id,
    name,
    color: '#3b82f6',
    weekDay,
    startTime: '19:00',
    endTime: '20:45',
    _count: { parts: 15, serviceParts: 4 },
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.event.groupBy).mockResolvedValue([] as never)
  vi.mocked(db.event.findMany).mockResolvedValue([] as never)
})

describe('getProgrammeCreationData', () => {
  it('lists regular meetings Monday first, then the templates without a day, by name', async () => {
    vi.mocked(db.eventTemplate.findMany).mockResolvedValue([
      template(271, 'Réunion du week-end', 0),
      template(272, 'Mémorial', null),
      template(270, 'Réunion de semaine', 4),
      template(274, 'Assemblée', null),
    ] as never)

    const { templates } = await getProgrammeCreationData(db, {
      congregationId: 7,
      timezone: MARTINIQUE,
      today: '2026-11-10',
      templateIds: null,
    })

    expect(templates.map(row => row.name)).toEqual([
      'Réunion de semaine',
      'Réunion du week-end',
      'Assemblée',
      'Mémorial',
    ])
    expect(templates[0]).toEqual({
      id: 270,
      name: 'Réunion de semaine',
      color: '#3b82f6',
      weekDay: 4,
      startTime: '19:00',
      endTime: '20:45',
      parts: 15,
      services: 4,
      lastDay: null,
    })
  })

  it('gives each template the day of its latest programme, in the congregation zone', async () => {
    vi.mocked(db.eventTemplate.findMany).mockResolvedValue([template(270, 'Réunion de semaine', 4)] as never)
    // 19:00 on Thursday 31 December in Martinique is already 1 January in UTC.
    vi.mocked(db.event.groupBy).mockResolvedValue([
      { templateId: 270, _max: { startDate: new Date('2026-12-31T23:00:00Z') } },
    ] as never)

    const { templates } = await getProgrammeCreationData(db, {
      congregationId: 7,
      timezone: MARTINIQUE,
      today: '2026-11-10',
      templateIds: null,
    })

    expect(templates[0]?.lastDay).toBe('2026-12-31')
  })

  it('lists the programmes to come of those templates, on congregation days', async () => {
    vi.mocked(db.eventTemplate.findMany).mockResolvedValue([template(270, 'Réunion de semaine', 4)] as never)
    vi.mocked(db.event.findMany).mockResolvedValue([
      { id: 4016, templateId: 270, startDate: new Date('2026-11-12T23:00:00Z') },
    ] as never)

    const { existing } = await getProgrammeCreationData(db, {
      congregationId: 7,
      timezone: MARTINIQUE,
      today: '2026-11-10',
      templateIds: [270],
    })

    expect(existing).toEqual([{ templateId: 270, day: '2026-11-12', eventId: 4016 }])
  })

  it('asks nothing more when there is no template', async () => {
    vi.mocked(db.eventTemplate.findMany).mockResolvedValue([] as never)

    const result = await getProgrammeCreationData(db, {
      congregationId: 7,
      timezone: MARTINIQUE,
      today: '2026-11-10',
      templateIds: [],
    })

    expect(result).toEqual({ templates: [], existing: [] })
    expect(db.event.findMany).not.toHaveBeenCalled()
  })
})
