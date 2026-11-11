import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/features/events/index.server', () => ({ getTemplateById: vi.fn(), listPartPresets: vi.fn() }))
vi.mock('~/shared/domain/roles.server', () => ({ listRoles: vi.fn(), listDelegatableRoles: vi.fn() }))
vi.mock('~/shared/auth/permissions.server', () => ({ findMembersWithAnyRole: vi.fn() }))

const { getTemplateById, listPartPresets } = await import('~/features/events/index.server')
const { listRoles, listDelegatableRoles } = await import('~/shared/domain/roles.server')
const { findMembersWithAnyRole } = await import('~/shared/auth/permissions.server')
const { getTemplatePage } = await import('./template-page.queries')

const db = {
  templatePartAllowedRole: { findMany: vi.fn() },
  templateServicePartAllowedRole: { findMany: vi.fn() },
  event: { count: vi.fn() },
  member: { findMany: vi.fn() },
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
  vi.mocked(listDelegatableRoles).mockResolvedValue([] as never)
  vi.mocked(listPartPresets).mockResolvedValue([] as never)
  db.templatePartAllowedRole.findMany.mockResolvedValue([
    { partId: 1, roleId: 30, asKind: 'speaker' },
    { partId: 1, roleId: 31, asKind: 'reader' },
  ])
  db.templateServicePartAllowedRole.findMany.mockResolvedValue([{ servicePartId: 2, roleId: 40 }])
  db.event.count.mockResolvedValue(42)
  vi.mocked(findMembersWithAnyRole).mockResolvedValue([7])
  db.member.findMany.mockResolvedValue([{ id: 7, firstname: 'Henri', lastname: 'Moreau' }])
})

describe('getTemplatePage', () => {
  it('is null for a template outside the congregation', async () => {
    vi.mocked(getTemplateById).mockResolvedValue(null)

    expect(await getTemplatePage(db as never, 12, 3, { withResponsibles: true })).toBeNull()
  })

  it('gives each part and service the roles allowed on it', async () => {
    const page = await getTemplatePage(db as never, 12, 3, { withResponsibles: true })

    expect(page?.template.parts[0]).toMatchObject({ allowedSpeakerRoleIds: [30], allowedReaderRoleIds: [31] })
    expect(page?.template.serviceParts[0]).toMatchObject({ allowedRoleIds: [40] })
  })

  it('names who runs each part of the template today, and how many programmes use it', async () => {
    const page = await getTemplatePage(db as never, 12, 3, { withResponsibles: true })

    expect(page?.responsibles).toEqual({
      programme: { roleId: 5, holders: ['Henri MOREAU'] },
      service: { roleId: null, holders: [] },
      roles: [],
    })
    expect(page?.eventCount).toBe(42)
  })

  it('leaves out who runs the template, and who holds those roles, for anyone but a template manager', async () => {
    const page = await getTemplatePage(db as never, 12, 3, { withResponsibles: false })

    expect(page?.responsibles).toBeNull()
    expect(findMembersWithAnyRole).not.toHaveBeenCalled()
    expect(listDelegatableRoles).not.toHaveBeenCalled()
  })
})
