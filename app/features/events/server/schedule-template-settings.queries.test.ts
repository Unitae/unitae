import { describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({ unscopedDb: { scheduleTemplate: { findMany: vi.fn() } } }))

const { listScheduleTemplatesForSettings } = await import('./schedule-template-settings.queries')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

describe('listScheduleTemplatesForSettings', () => {
  it('counts each template’s items on its own kind, and names the kinds suggesting it', async () => {
    vi.mocked(db.scheduleTemplate.findMany).mockResolvedValue([
      {
        id: 1,
        name: 'Réunion de semaine',
        key: null,
        kind: 'programme',
        responsibleRole: { id: 7, key: 'vcm', name: null },
        eventKinds: [{ eventKind: { id: 270, name: 'Réunion de semaine' } }],
        _count: { parts: 15, serviceParts: 3, schedules: 99, rooms: 3 },
      },
      {
        id: 2,
        name: null,
        key: 'services',
        kind: 'duty',
        responsibleRole: null,
        eventKinds: [],
        _count: { parts: 2, serviceParts: 4, schedules: 0, rooms: 0 },
      },
    ] as never)

    expect(await listScheduleTemplatesForSettings(db, 3)).toEqual([
      {
        id: 1,
        name: 'Réunion de semaine',
        key: null,
        kind: 'programme',
        items: 15,
        responsibleRole: { id: 7, key: 'vcm', name: null },
        kinds: [{ id: 270, name: 'Réunion de semaine' }],
        schedules: 99,
        rooms: 3,
      },
      {
        id: 2,
        name: null,
        key: 'services',
        kind: 'duty',
        items: 4,
        responsibleRole: null,
        kinds: [],
        schedules: 0,
        rooms: 0,
      },
    ])
  })
})
