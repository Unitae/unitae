import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/features/events/index.server', async () => ({
  EMPTY_MEETING: (await import('~/features/events/server/empty-meetings.queries')).EMPTY_MEETING,
  getTemplateById: vi.fn(),
  listPartPresets: vi.fn(),
}))
vi.mock('~/shared/domain/roles.server', () => ({ listRoles: vi.fn() }))

const { getTemplateById, listPartPresets } = await import('~/features/events/index.server')
const { listRoles } = await import('~/shared/domain/roles.server')
const { getTemplatePage } = await import('./template-page.queries')

const db = {
  templatePartAllowedRole: { findMany: vi.fn() },
  templateServicePartAllowedRole: { findMany: vi.fn() },
  event: { count: vi.fn() },
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getTemplateById).mockResolvedValue({
    id: 12,
    key: 'midweek',
    name: 'Réunion de semaine',
    parts: [{ id: 1, section: 'Joyaux', track: '' }],
    serviceParts: [{ id: 2, name: 'Sono' }],
    responsibles: [{ scope: 'programme', role: { id: 5, key: 'vcm', name: 'Responsable VCM' } }],
  } as never)
  vi.mocked(listRoles).mockResolvedValue([] as never)
  vi.mocked(listPartPresets).mockResolvedValue([] as never)
  db.templatePartAllowedRole.findMany.mockResolvedValue([
    { partId: 1, roleId: 30, asKind: 'speaker' },
    { partId: 1, roleId: 31, asKind: 'reader' },
  ])
  db.templateServicePartAllowedRole.findMany.mockResolvedValue([{ servicePartId: 2, roleId: 40 }])
  db.event.count.mockResolvedValue(42)
})

describe('getTemplatePage', () => {
  it('is null for a template outside the congregation', async () => {
    vi.mocked(getTemplateById).mockResolvedValue(null)

    expect(await getTemplatePage(db as never, 12, 3)).toBeNull()
  })

  it('gives each part and service the roles allowed on it', async () => {
    const page = await getTemplatePage(db as never, 12, 3)

    expect(page?.template.parts[0]).toMatchObject({ allowedSpeakerRoleIds: [30], allowedReaderRoleIds: [31] })
    expect(page?.template.serviceParts[0]).toMatchObject({ allowedRoleIds: [40] })
  })

  it('says how many programmes use it', async () => {
    const page = await getTemplatePage(db as never, 12, 3)

    expect(page?.eventCount).toBe(42)
  })
})
