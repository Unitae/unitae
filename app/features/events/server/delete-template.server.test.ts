import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: { eventTemplate: { findFirst: vi.fn(), delete: vi.fn() } },
}))
vi.mock('~/shared/domain/audit.server', () => ({
  audit: vi.fn(),
  AuditAction: { TemplateDeleted: 'event_template.deleted' },
}))

const { deleteTemplate } = await import('./delete-template.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const auditModule = await import('~/shared/domain/audit.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('deleteTemplate', () => {
  it('deletes a custom template with no linked events and returns its name', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({
      key: 'midweek',
      name: 'Réunion de semaine',
      _count: { events: 0 },
    } as never)
    vi.mocked(db.eventTemplate.delete).mockResolvedValue({ id: 7 } as never)

    const result = await deleteTemplate(db, 7, 1, 9)

    expect(result).toEqual({ ok: true, name: 'Réunion de semaine' })
    expect(db.eventTemplate.delete).toHaveBeenCalledWith({
      where: { id_congregationId: { id: 7, congregationId: 1 } },
    })
    expect(auditModule.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'event_template.deleted',
        actorId: 9,
        entityId: 7,
        metadata: { name: 'Réunion de semaine' },
      }),
    )
  })

  it('returns not-found and never deletes when the template does not exist', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue(null as never)

    const result = await deleteTemplate(db, 999, 1, 9)

    expect(result).toEqual({ ok: false, reason: 'not-found' })
    expect(db.eventTemplate.delete).not.toHaveBeenCalled()
  })

  // System templates (day-off, freeform) are looked up by key at runtime; the
  // server refuses to remove them even if a stale form POSTs the intent.
  it('refuses to delete a system template', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({
      key: 'day-off',
      name: 'Jour de congé',
      _count: { events: 0 },
    } as never)

    const result = await deleteTemplate(db, 3, 1, 9)

    expect(result).toEqual({ ok: false, reason: 'system' })
    expect(db.eventTemplate.delete).not.toHaveBeenCalled()
  })

  // Event.templateId is ON DELETE SET NULL: removing an in-use template would
  // orphan its events (templateId → NULL) and drop them from key-filtered
  // queries. The writer blocks it and surfaces the count instead.
  it('refuses to delete a template still linked to events and reports the count', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({
      key: 'midweek',
      name: 'Réunion de semaine',
      _count: { events: 4 },
    } as never)

    const result = await deleteTemplate(db, 7, 1, 9)

    expect(result).toEqual({ ok: false, reason: 'in-use', eventCount: 4 })
    expect(db.eventTemplate.delete).not.toHaveBeenCalled()
  })

  it('scopes the lookup to the given congregation', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue(null as never)

    await deleteTemplate(db, 7, 42, 9)

    const args = vi.mocked(db.eventTemplate.findFirst).mock.calls[0][0]
    expect(args?.where).toEqual({ id: 7, congregationId: 42 })
  })
})
