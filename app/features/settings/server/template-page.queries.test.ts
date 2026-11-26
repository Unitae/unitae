import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/features/events/index.server', async () => ({
  EMPTY_MEETING: (await import('~/features/events/server/empty-meetings.queries')).EMPTY_MEETING,
  getTemplateById: vi.fn(),
  listScheduleTemplatesForSettings: vi.fn(),
}))
vi.mock('~/shared/domain/roles.server', () => ({ listDelegatableRoles: vi.fn() }))

const { getTemplateById, listScheduleTemplatesForSettings } = await import('~/features/events/index.server')
const { listDelegatableRoles } = await import('~/shared/domain/roles.server')
const { getTemplatePage } = await import('./template-page.queries')

const db = {
  event: { count: vi.fn() },
  eventKindScheduleTemplate: { findMany: vi.fn() },
}

const scheduleTemplate = (id: number, name: string) => ({
  id,
  name,
  key: null,
  kind: 'programme',
  items: 3,
  responsibleRole: null,
  kinds: [],
  schedules: 0,
  rooms: 1,
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getTemplateById).mockResolvedValue({ id: 12, key: 'midweek', name: 'Réunion de semaine' } as never)
  vi.mocked(listScheduleTemplatesForSettings).mockResolvedValue([
    scheduleTemplate(7, 'Services'),
    scheduleTemplate(8, 'Nettoyage'),
    scheduleTemplate(9, 'Réunion de semaine'),
  ] as never)
  vi.mocked(listDelegatableRoles).mockResolvedValue([{ id: 5, key: null, name: 'Sono', isBuiltIn: false }] as never)
  db.eventKindScheduleTemplate.findMany.mockResolvedValue([{ scheduleTemplateId: 9 }, { scheduleTemplateId: 7 }])
  db.event.count.mockResolvedValue(42)
})

describe('getTemplatePage', () => {
  it('is null for a template outside the congregation', async () => {
    vi.mocked(getTemplateById).mockResolvedValue(null)

    expect(await getTemplatePage(db as never, 12, 3)).toBeNull()
  })

  it('lists the schedule templates the type uses, in its order, and no other', async () => {
    const page = await getTemplatePage(db as never, 12, 3)

    expect(page?.scheduleTemplates.map(each => each.id)).toEqual([9, 7])
    expect(db.eventKindScheduleTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { eventKindId: 12, congregationId: 3 } }),
    )
  })

  it('names the roles a responsible may be', async () => {
    const page = await getTemplatePage(db as never, 12, 3)

    expect(page?.roles).toEqual([{ id: 5, label: 'Sono' }])
  })

  it('says how many programmes use it', async () => {
    const page = await getTemplatePage(db as never, 12, 3)

    expect(page?.eventCount).toBe(42)
  })
})
