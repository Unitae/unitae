import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Permission } from '~/shared/types/permission'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    templateResponsible: { findFirst: vi.fn(), findMany: vi.fn() },
    event: { findMany: vi.fn() },
  },
}))

const {
  canEditEvent,
  canManageEvent,
  getEventEditScope,
  getResponsibleTemplateIds,
  canManageAnyProgram,
  filterToManageableEventIds,
} = await import('./events-auth.server')
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

  it('returns true for non-manager when a full responsible record exists', async () => {
    vi.mocked(db.templateResponsible.findMany).mockResolvedValue([{ scope: 'full' }] as never)

    const result = await canEditEvent(db, allowNone, USER_ID, TEMPLATE_ID_OWNED, CONGREGATION_ID)
    expect(result).toBe(true)
  })

  it('returns true for non-manager when a service responsible record exists', async () => {
    vi.mocked(db.templateResponsible.findMany).mockResolvedValue([{ scope: 'service' }] as never)

    const result = await canEditEvent(db, allowNone, USER_ID, TEMPLATE_ID_OWNED, CONGREGATION_ID)
    expect(result).toBe(true)
  })

  it('returns false for non-manager when no responsible record exists', async () => {
    vi.mocked(db.templateResponsible.findMany).mockResolvedValue([] as never)

    const result = await canEditEvent(db, allowNone, USER_ID, TEMPLATE_ID_OTHER, CONGREGATION_ID)
    expect(result).toBe(false)
  })
})

describe('getEventEditScope', () => {
  it("returns 'full' for a ProgramManager regardless of templateId (incl. freeform)", async () => {
    expect(await getEventEditScope(db, allowOnly(Permission.ProgramManager), USER_ID, null, CONGREGATION_ID)).toBe(
      'full',
    )
  })

  it('returns null for a non-manager on a freeform event (templateId null)', async () => {
    expect(await getEventEditScope(db, allowNone, USER_ID, null, CONGREGATION_ID)).toBeNull()
  })

  it("returns 'full' when the user is the full responsible", async () => {
    vi.mocked(db.templateResponsible.findMany).mockResolvedValue([{ scope: 'full' }] as never)
    expect(await getEventEditScope(db, allowNone, USER_ID, TEMPLATE_ID_OWNED, CONGREGATION_ID)).toBe('full')
  })

  it("returns 'service' when the user is only the service responsible", async () => {
    vi.mocked(db.templateResponsible.findMany).mockResolvedValue([{ scope: 'service' }] as never)
    expect(await getEventEditScope(db, allowNone, USER_ID, TEMPLATE_ID_OWNED, CONGREGATION_ID)).toBe('service')
  })

  it("returns 'full' when the user holds both scopes (full dominates)", async () => {
    vi.mocked(db.templateResponsible.findMany).mockResolvedValue([{ scope: 'service' }, { scope: 'full' }] as never)
    expect(await getEventEditScope(db, allowNone, USER_ID, TEMPLATE_ID_OWNED, CONGREGATION_ID)).toBe('full')
  })

  it('returns null when the user holds no responsibility on the template', async () => {
    vi.mocked(db.templateResponsible.findMany).mockResolvedValue([] as never)
    expect(await getEventEditScope(db, allowNone, USER_ID, TEMPLATE_ID_OTHER, CONGREGATION_ID)).toBeNull()
  })
})

describe('canManageEvent', () => {
  it('returns true for a ProgramManager', async () => {
    expect(await canManageEvent(db, allowOnly(Permission.ProgramManager), USER_ID, null, CONGREGATION_ID)).toBe(true)
  })

  it('returns true for the full responsible', async () => {
    vi.mocked(db.templateResponsible.findMany).mockResolvedValue([{ scope: 'full' }] as never)
    expect(await canManageEvent(db, allowNone, USER_ID, TEMPLATE_ID_OWNED, CONGREGATION_ID)).toBe(true)
  })

  it('returns false for a service responsible (full-only gate)', async () => {
    vi.mocked(db.templateResponsible.findMany).mockResolvedValue([{ scope: 'service' }] as never)
    expect(await canManageEvent(db, allowNone, USER_ID, TEMPLATE_ID_OWNED, CONGREGATION_ID)).toBe(false)
  })

  it('returns false for a plain non-manager', async () => {
    vi.mocked(db.templateResponsible.findMany).mockResolvedValue([] as never)
    expect(await canManageEvent(db, allowNone, USER_ID, TEMPLATE_ID_OTHER, CONGREGATION_ID)).toBe(false)
  })
})

describe('getResponsibleTemplateIds', () => {
  it('returns an empty array when the user is responsible for nothing', async () => {
    vi.mocked(db.templateResponsible.findMany).mockResolvedValue([] as never)

    const result = await getResponsibleTemplateIds(db, USER_ID, CONGREGATION_ID)
    expect(result).toEqual([])
  })

  it('returns the list of templateIds for the user', async () => {
    vi.mocked(db.templateResponsible.findMany).mockResolvedValue([
      { templateId: TEMPLATE_ID_OWNED },
      { templateId: TEMPLATE_ID_OTHER },
    ] as never)

    const result = await getResponsibleTemplateIds(db, USER_ID, CONGREGATION_ID)
    expect(result).toEqual([TEMPLATE_ID_OWNED, TEMPLATE_ID_OTHER])
  })

  it('passes an all-scopes filter (no scope) when scope is omitted', async () => {
    vi.mocked(db.templateResponsible.findMany).mockResolvedValue([] as never)

    await getResponsibleTemplateIds(db, USER_ID, CONGREGATION_ID)

    const where = vi.mocked(db.templateResponsible.findMany).mock.calls[0][0]?.where as Record<string, unknown>
    expect(where).toEqual({ userId: USER_ID, congregationId: CONGREGATION_ID })
  })

  it('filters by scope when one is provided', async () => {
    vi.mocked(db.templateResponsible.findMany).mockResolvedValue([] as never)

    await getResponsibleTemplateIds(db, USER_ID, CONGREGATION_ID, 'full')

    const where = vi.mocked(db.templateResponsible.findMany).mock.calls[0][0]?.where as Record<string, unknown>
    expect(where).toEqual({ userId: USER_ID, congregationId: CONGREGATION_ID, scope: 'full' })
  })
})

describe('canManageAnyProgram', () => {
  it('returns true for ProgramManager without consulting the database', async () => {
    const result = await canManageAnyProgram(db, allowAll, USER_ID, CONGREGATION_ID)
    expect(result).toBe(true)
  })

  it('returns true for non-manager when at least one responsible record exists', async () => {
    vi.mocked(db.templateResponsible.findMany).mockResolvedValue([{ templateId: TEMPLATE_ID_OWNED }] as never)

    const result = await canManageAnyProgram(db, allowNone, USER_ID, CONGREGATION_ID)
    expect(result).toBe(true)
  })

  it('scopes the responsibility check to full responsibilities only', async () => {
    vi.mocked(db.templateResponsible.findMany).mockResolvedValue([] as never)

    await canManageAnyProgram(db, allowNone, USER_ID, CONGREGATION_ID)

    const where = vi.mocked(db.templateResponsible.findMany).mock.calls[0][0]?.where as Record<string, unknown>
    expect(where).toMatchObject({ scope: 'full' })
  })

  it('returns false for non-manager when no responsible records exist', async () => {
    vi.mocked(db.templateResponsible.findMany).mockResolvedValue([] as never)

    const result = await canManageAnyProgram(db, allowNone, USER_ID, CONGREGATION_ID)
    expect(result).toBe(false)
  })
})

describe('filterToManageableEventIds', () => {
  // Empty input short-circuits — no DB roundtrip, no reliance on Prisma's
  // empty-`in: []` semantics (which today happen to match nothing, but the
  // guarantee is fragile enough to be worth an explicit guard).
  it('returns an empty list without any DB call when the input is empty', async () => {
    const result = await filterToManageableEventIds(db, allowAll, [], USER_ID, CONGREGATION_ID)
    expect(result).toEqual([])
    expect(db.event.findMany).not.toHaveBeenCalled()
    expect(db.templateResponsible.findMany).not.toHaveBeenCalled()
  })

  // Manager path still validates ids belong to the congregation — a request
  // with a cross-tenant id must not silently sneak into `notFound` further
  // down. The event.findMany scope kicks foreign ids out here where it's
  // observable at review time.
  it('for ProgramManager, keeps only ids that belong to this congregation', async () => {
    vi.mocked(db.event.findMany).mockResolvedValue([
      { id: 10, templateId: TEMPLATE_ID_OWNED },
      { id: 11, templateId: null },
      // id 99 (a foreign id) is not in the mock result — mimics RLS filtering it out.
    ] as never)

    const result = await filterToManageableEventIds(db, allowAll, [10, 11, 99], USER_ID, CONGREGATION_ID)

    expect(result).toEqual([10, 11])
    const call = vi.mocked(db.event.findMany).mock.calls[0][0]
    const where = call?.where as Record<string, unknown>
    expect(where.congregationId).toBe(CONGREGATION_ID)
  })

  // Non-manager path: only keep events whose templateId is in the user's
  // responsibility set. Freeform events (templateId=null) are dropped —
  // consistent with canEditEvent's freeform-events-are-manager-only rule.
  it('keeps only events on templates the user is responsible for (non-manager)', async () => {
    vi.mocked(db.templateResponsible.findMany).mockResolvedValue([{ templateId: TEMPLATE_ID_OWNED }] as never)
    vi.mocked(db.event.findMany).mockResolvedValue([
      { id: 10, templateId: TEMPLATE_ID_OWNED },
      { id: 11, templateId: TEMPLATE_ID_OTHER },
      { id: 12, templateId: null },
    ] as never)

    const result = await filterToManageableEventIds(db, allowNone, [10, 11, 12], USER_ID, CONGREGATION_ID)

    expect(result).toEqual([10])
  })

  it('returns an empty list when the non-manager has no template responsibilities', async () => {
    vi.mocked(db.templateResponsible.findMany).mockResolvedValue([] as never)
    vi.mocked(db.event.findMany).mockResolvedValue([{ id: 10, templateId: TEMPLATE_ID_OWNED }] as never)

    const result = await filterToManageableEventIds(db, allowNone, [10], USER_ID, CONGREGATION_ID)

    expect(result).toEqual([])
  })
})
