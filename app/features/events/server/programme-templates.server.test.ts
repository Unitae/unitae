import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/domain/audit.server', () => ({ audit: vi.fn(), AuditAction: {} }))

vi.mock('~/shared/infra/db.server', () => ({
  db: {
    programmeTemplate: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    programmeTemplatePart: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    programmeTemplateServiceRole: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    programmeTemplateResponsible: { upsert: vi.fn(), deleteMany: vi.fn(), findFirst: vi.fn() },
  },
  unscopedDb: { auditLog: { create: vi.fn().mockResolvedValue({}) } },
}))

const {
  getTemplates,
  getTemplateById,
  updateTemplate,
  upsertTemplatePart,
  deleteTemplatePart,
  upsertTemplateServiceRole,
  deleteTemplateServiceRole,
  setTemplateResponsible,
  removeTemplateResponsible,
  isTemplateResponsible,
} = await import('./programme-templates.server')
const { db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getTemplates', () => {
  it('returns all templates for a congregation', async () => {
    const fakeTemplates = [{ id: 1, name: 'Réunion de semaine' }]
    vi.mocked(db.programmeTemplate.findMany).mockResolvedValue(fakeTemplates as never)

    const result = await getTemplates(db, 1)
    expect(result).toEqual(fakeTemplates)
  })
})

describe('getTemplateById', () => {
  it('returns a template with parts and service roles', async () => {
    const fakeTemplate = { id: 1, name: 'Réunion de semaine', parts: [], serviceRoles: [] }
    vi.mocked(db.programmeTemplate.findFirst).mockResolvedValue(fakeTemplate as never)

    const result = await getTemplateById(db, 1, 1)
    expect(result).toEqual(fakeTemplate)
  })

  it('returns null when template not found', async () => {
    vi.mocked(db.programmeTemplate.findFirst).mockResolvedValue(null as never)

    const result = await getTemplateById(db, 999, 1)
    expect(result).toBeNull()
  })
})

describe('updateTemplate', () => {
  it('updates template name', async () => {
    const updated = { id: 1, name: 'Updated Name' }
    vi.mocked(db.programmeTemplate.update).mockResolvedValue(updated as never)

    const result = await updateTemplate(db, 1, { name: 'Updated Name' }, 1, 1)
    expect(result).toEqual(updated)
  })

  it('sets kindId when provided', async () => {
    vi.mocked(db.programmeTemplate.update).mockResolvedValue({ id: 1 } as never)

    await updateTemplate(db, 1, { name: 'Réunion', kindId: 5 }, 1, 1)

    const call = vi.mocked(db.programmeTemplate.update).mock.calls[0]
    expect((call[0] as { data: { kindId: number } }).data.kindId).toBe(5)
  })

  it('clears kindId when set to null', async () => {
    vi.mocked(db.programmeTemplate.update).mockResolvedValue({ id: 1 } as never)

    await updateTemplate(db, 1, { name: 'Réunion', kindId: null }, 1, 1)

    const call = vi.mocked(db.programmeTemplate.update).mock.calls[0]
    expect((call[0] as { data: { kindId: null } }).data.kindId).toBeNull()
  })
})

describe('upsertTemplatePart', () => {
  it('creates a new part when no id provided', async () => {
    const newPart = { id: 10, name: 'New Part' }
    vi.mocked(db.programmeTemplatePart.create).mockResolvedValue(newPart as never)

    const result = await upsertTemplatePart(
      db,
      1,
      { name: 'New Part', section: '', track: '', order: 1, durationMin: 10, allowExternalSpeaker: false },
      1,
    )
    expect(result).toEqual(newPart)
  })

  it('updates an existing part when id is provided', async () => {
    const updatedPart = { id: 5, name: 'Updated Part' }
    vi.mocked(db.programmeTemplatePart.update).mockResolvedValue(updatedPart as never)

    const result = await upsertTemplatePart(
      db,
      1,
      { id: 5, name: 'Updated Part', section: '', track: '', order: 1, durationMin: 10, allowExternalSpeaker: false },
      1,
    )
    expect(result).toEqual(updatedPart)
  })
})

describe('deleteTemplatePart', () => {
  it('deletes a part', async () => {
    const deleted = { id: 5 }
    vi.mocked(db.programmeTemplatePart.delete).mockResolvedValue(deleted as never)

    const result = await deleteTemplatePart(db, 5, 1)
    expect(result).toEqual(deleted)
  })
})

describe('upsertTemplateServiceRole', () => {
  it('creates a new service role when no id provided', async () => {
    const newRole = { id: 10, name: 'Sono', key: 'sono' }
    vi.mocked(db.programmeTemplateServiceRole.create).mockResolvedValue(newRole as never)

    const result = await upsertTemplateServiceRole(db, 1, { name: 'Sono', key: 'sono' }, 1)
    expect(result).toEqual(newRole)
  })

  it('updates an existing service role when id is provided', async () => {
    const updatedRole = { id: 3, name: 'Updated' }
    vi.mocked(db.programmeTemplateServiceRole.update).mockResolvedValue(updatedRole as never)

    const result = await upsertTemplateServiceRole(db, 1, { id: 3, name: 'Updated', key: 'updated' }, 1)
    expect(result).toEqual(updatedRole)
  })
})

describe('deleteTemplateServiceRole', () => {
  it('deletes a service role', async () => {
    const deleted = { id: 3 }
    vi.mocked(db.programmeTemplateServiceRole.delete).mockResolvedValue(deleted as never)

    const result = await deleteTemplateServiceRole(db, 3, 1)
    expect(result).toEqual(deleted)
  })
})

describe('setTemplateResponsible', () => {
  it('upserts a responsible user for a template', async () => {
    const responsible = { id: 1, templateId: 1, userId: 5 }
    vi.mocked(db.programmeTemplateResponsible.upsert).mockResolvedValue(responsible as never)

    const result = await setTemplateResponsible(db, 1, 5, 1)
    expect(result).toEqual(responsible)
  })
})

describe('removeTemplateResponsible', () => {
  it('removes the responsible from a template', async () => {
    vi.mocked(db.programmeTemplateResponsible.deleteMany).mockResolvedValue({ count: 1 } as never)

    const result = await removeTemplateResponsible(db, 1, 1)
    expect(result).toEqual({ count: 1 })
  })
})

describe('isTemplateResponsible', () => {
  it('returns the record when user is responsible', async () => {
    const record = { id: 1, templateId: 1, userId: 5 }
    vi.mocked(db.programmeTemplateResponsible.findFirst).mockResolvedValue(record as never)

    const result = await isTemplateResponsible(db, 1, 5, 1)
    expect(result).toEqual(record)
  })

  it('returns null when user is not responsible', async () => {
    vi.mocked(db.programmeTemplateResponsible.findFirst).mockResolvedValue(null as never)

    const result = await isTemplateResponsible(db, 1, 99, 1)
    expect(result).toBeNull()
  })
})
