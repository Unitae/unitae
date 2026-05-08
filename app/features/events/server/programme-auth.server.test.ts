import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Permission } from '~/shared/types/permission'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    programmeTemplateResponsible: { findFirst: vi.fn(), findMany: vi.fn() },
  },
}))

const { canEditEvent, getResponsibleTemplateIds, canManageAnyProgram } = await import('./programme-auth.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

const CONGREGATION_ID = 4242
const USER_ID = 7777
const TEMPLATE_ID_OWNED = 1001
const TEMPLATE_ID_OTHER = 2002

const allowAll = (_p: Permission) => true
const allowNone = (_p: Permission) => false
const allowOnly = (allowed: Permission) => (p: Permission) => p === allowed

beforeEach(() => {
  vi.resetAllMocks()
})

describe('canEditEvent', () => {
  it('returns true for ProgramManager regardless of templateId', async () => {
    const result = await canEditEvent(db, allowOnly(Permission.ProgramManager), USER_ID, null, CONGREGATION_ID)
    expect(result).toBe(true)
  })

  it('returns false for non-manager when templateId is null (freeform event)', async () => {
    const result = await canEditEvent(db, allowNone, USER_ID, null, CONGREGATION_ID)
    expect(result).toBe(false)
  })

  it('returns true for non-manager when responsible record exists', async () => {
    vi.mocked(db.programmeTemplateResponsible.findFirst).mockResolvedValue({
      id: 1,
      templateId: TEMPLATE_ID_OWNED,
      userId: USER_ID,
      congregationId: CONGREGATION_ID,
    } as never)

    const result = await canEditEvent(db, allowNone, USER_ID, TEMPLATE_ID_OWNED, CONGREGATION_ID)
    expect(result).toBe(true)
  })

  it('returns false for non-manager when no responsible record exists', async () => {
    vi.mocked(db.programmeTemplateResponsible.findFirst).mockResolvedValue(null as never)

    const result = await canEditEvent(db, allowNone, USER_ID, TEMPLATE_ID_OTHER, CONGREGATION_ID)
    expect(result).toBe(false)
  })
})

describe('getResponsibleTemplateIds', () => {
  it('returns an empty array when the user is responsible for nothing', async () => {
    vi.mocked(db.programmeTemplateResponsible.findMany).mockResolvedValue([] as never)

    const result = await getResponsibleTemplateIds(db, USER_ID, CONGREGATION_ID)
    expect(result).toEqual([])
  })

  it('returns the list of templateIds for the user', async () => {
    vi.mocked(db.programmeTemplateResponsible.findMany).mockResolvedValue([
      { templateId: TEMPLATE_ID_OWNED },
      { templateId: TEMPLATE_ID_OTHER },
    ] as never)

    const result = await getResponsibleTemplateIds(db, USER_ID, CONGREGATION_ID)
    expect(result).toEqual([TEMPLATE_ID_OWNED, TEMPLATE_ID_OTHER])
  })
})

describe('canManageAnyProgram', () => {
  it('returns true for ProgramManager without consulting the database', async () => {
    const result = await canManageAnyProgram(db, allowAll, USER_ID, CONGREGATION_ID)
    expect(result).toBe(true)
  })

  it('returns true for non-manager when at least one responsible record exists', async () => {
    vi.mocked(db.programmeTemplateResponsible.findMany).mockResolvedValue([{ templateId: TEMPLATE_ID_OWNED }] as never)

    const result = await canManageAnyProgram(db, allowNone, USER_ID, CONGREGATION_ID)
    expect(result).toBe(true)
  })

  it('returns false for non-manager when no responsible records exist', async () => {
    vi.mocked(db.programmeTemplateResponsible.findMany).mockResolvedValue([] as never)

    const result = await canManageAnyProgram(db, allowNone, USER_ID, CONGREGATION_ID)
    expect(result).toBe(false)
  })
})
