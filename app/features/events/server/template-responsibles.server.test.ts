import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/domain/roles.server', () => ({ listDelegatableRoles: vi.fn() }))
vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { TemplateResponsiblesChanged: 'event_template.responsibles.changed' },
  audit: vi.fn(),
}))

const { listDelegatableRoles } = await import('~/shared/domain/roles.server')
const { audit } = await import('~/shared/domain/audit.server')
const { saveTemplateResponsibles } = await import('./template-responsibles.server')
const { ValidationError } = await import('~/shared/errors/app-error.server')

const db = { templateResponsible: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() } }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(listDelegatableRoles).mockResolvedValue([{ id: 5 }, { id: 6 }] as never)
  // Today the programme is run by role 5 and nobody runs the services.
  db.templateResponsible.findMany.mockResolvedValue([{ scope: 'programme', roleId: 5 }])
})

describe('saveTemplateResponsibles', () => {
  it('writes nothing when the roles did not change', async () => {
    const changed = await saveTemplateResponsibles(db as never, 12, { programmeRoleId: 5, serviceRoleId: null }, 3, 9)

    expect(changed).toBe(false)
    expect(db.templateResponsible.upsert).not.toHaveBeenCalled()
    expect(db.templateResponsible.deleteMany).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })

  it('gives each part of the template its own role, and says so in the audit log', async () => {
    const changed = await saveTemplateResponsibles(db as never, 12, { programmeRoleId: null, serviceRoleId: 6 }, 3, 9)

    expect(changed).toBe(true)
    expect(db.templateResponsible.deleteMany).toHaveBeenCalledWith({
      where: { templateId: 12, scope: 'programme', congregationId: 3 },
    })
    expect(db.templateResponsible.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { templateId: 12, roleId: 6, scope: 'service', congregationId: 3 } }),
    )
    expect(audit).toHaveBeenCalledWith({
      action: 'event_template.responsibles.changed',
      congregationId: 3,
      actorId: 9,
      entityType: 'EventTemplate',
      entityId: 12,
      metadata: { programme: { from: 5, to: null }, service: { from: null, to: 6 } },
    })
  })

  it('refuses a role that cannot run a template here, another congregation’s included', async () => {
    await expect(
      saveTemplateResponsibles(db as never, 12, { programmeRoleId: 77, serviceRoleId: null }, 3, 9),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(db.templateResponsible.upsert).not.toHaveBeenCalled()
  })
})
