import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ResponsibilityScope } from '~/features/events/model/responsibility-scope.type'
import { Permission } from '~/shared/types/permission'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    templateResponsible: { findFirst: vi.fn(), findMany: vi.fn() },
    role: { findMany: vi.fn() },
    event: { findMany: vi.fn() },
  },
}))

const { canEditEvent, getResponsibleTemplateIds, canManageAnyProgram, filterToManageableEventIds } = await import(
  './events-auth.server'
)
const { unscopedDb: db } = await import('~/shared/infra/db.server')

const CONGREGATION_ID = 4242
const USER_ID = 7777
const TEMPLATE_ID_OWNED = 1001
const TEMPLATE_ID_OTHER = 2002
const ROLE_ID = 5005

const allowAll = (_p: Permission) => true
const allowNone = (_p: Permission) => false
const allowOnly = (allowed: Permission) => (p: Permission) => p === allowed

beforeEach(() => {
  vi.resetAllMocks()
  // The caller holds a role by default, so these cases keep testing what they always did:
  // whether that role is the template's responsible. The no-roles case is explicit below.
  vi.mocked(db.role.findMany).mockResolvedValue([{ id: ROLE_ID }] as never)
})

describe('filterToManageableEventIds — required permission', () => {
  it('honours the capability it is asked for, not the blanket manage permission', async () => {
    // bulk-release asks for CanPublishPrograms. Someone holding only CanManagePrograms
    // must not sail through — the split is meaningless if the bulk routes ignore it.
    vi.mocked(db.event.findMany).mockResolvedValue([{ id: 1, templateId: null }] as never)
    vi.mocked(db.templateResponsible.findMany).mockResolvedValue([] as never)

    const allowed = await filterToManageableEventIds(
      db,
      allowOnly(Permission.CanManagePrograms),
      [1],
      USER_ID,
      CONGREGATION_ID,
      Permission.CanPublishPrograms,
    )
    expect(allowed).toEqual([])
  })

  it('passes everything through when the required capability is held', async () => {
    vi.mocked(db.event.findMany).mockResolvedValue([{ id: 1, templateId: null }] as never)

    const allowed = await filterToManageableEventIds(
      db,
      allowOnly(Permission.CanPublishPrograms),
      [1],
      USER_ID,
      CONGREGATION_ID,
      Permission.CanPublishPrograms,
    )
    expect(allowed).toEqual([1])
  })
})

describe('canEditEvent — required permission', () => {
  it('accepts the specific capability when one is asked for', async () => {
    // Assigning a part and publishing a programme are different jobs, so the routes
    // ask for the capability they need rather than the blanket manage permission.
    const result = await canEditEvent(
      db,
      allowOnly(Permission.CanAssignProgramParts),
      USER_ID,
      null,
      CONGREGATION_ID,
      Permission.CanAssignProgramParts,
    )
    expect(result).toBe(true)
  })

  it('refuses the blanket manage permission when a different capability is required', async () => {
    const result = await canEditEvent(
      db,
      allowOnly(Permission.CanManagePrograms),
      USER_ID,
      null,
      CONGREGATION_ID,
      Permission.CanPublishPrograms,
    )
    expect(result).toBe(false)
  })

  it('still lets the template responsible through when they lack the capability', async () => {
    // Delegation must survive the split: whoever is responsible for a template keeps
    // editing its events without being granted a congregation-wide permission.
    vi.mocked(db.templateResponsible.findFirst).mockResolvedValue({ id: 1 } as never)
    const result = await canEditEvent(
      db,
      allowNone,
      USER_ID,
      TEMPLATE_ID_OWNED,
      CONGREGATION_ID,
      Permission.CanPublishPrograms,
    )
    expect(result).toBe(true)
  })

  it('defaults to the manage permission when none is given', async () => {
    const result = await canEditEvent(db, allowOnly(Permission.CanManagePrograms), USER_ID, null, CONGREGATION_ID)
    expect(result).toBe(true)
  })
})

describe('canEditEvent', () => {
  it('returns true for ProgramManager regardless of templateId', async () => {
    const result = await canEditEvent(db, allowOnly(Permission.CanManagePrograms), USER_ID, null, CONGREGATION_ID)
    expect(result).toBe(true)
  })

  it('returns false for non-manager when templateId is null (freeform event)', async () => {
    const result = await canEditEvent(db, allowNone, USER_ID, null, CONGREGATION_ID)
    expect(result).toBe(false)
  })

  it('returns true for non-manager when responsible record exists', async () => {
    vi.mocked(db.templateResponsible.findFirst).mockResolvedValue({
      id: 1,
      templateId: TEMPLATE_ID_OWNED,
      roleId: ROLE_ID,
      congregationId: CONGREGATION_ID,
    } as never)

    const result = await canEditEvent(db, allowNone, USER_ID, TEMPLATE_ID_OWNED, CONGREGATION_ID)
    expect(result).toBe(true)
  })

  it('returns false for non-manager when no responsible record exists', async () => {
    vi.mocked(db.templateResponsible.findFirst).mockResolvedValue(null as never)

    const result = await canEditEvent(db, allowNone, USER_ID, TEMPLATE_ID_OTHER, CONGREGATION_ID)
    expect(result).toBe(false)
  })
})

describe('canEditEvent — responsibility scope', () => {
  // The scope reaches the query as a set of acceptable rows, and that set is the
  // whole mechanism: everything below asserts what got asked for, because a mock
  // returns whatever it is told regardless of the filter.
  const scopeAskedFor = () => {
    const where = vi.mocked(db.templateResponsible.findFirst).mock.calls[0][0]?.where as {
      scope: { in: string[] }
    }
    return where.scope.in
  }

  it('accepts only the whole-event delegation by default', async () => {
    vi.mocked(db.templateResponsible.findFirst).mockResolvedValue(null as never)

    await canEditEvent(db, allowNone, USER_ID, TEMPLATE_ID_OWNED, CONGREGATION_ID)

    expect(scopeAskedFor()).toEqual(['programme'])
  })

  it('accepts either delegation when the route is about the service parts', async () => {
    vi.mocked(db.templateResponsible.findFirst).mockResolvedValue(null as never)

    await canEditEvent(
      db,
      allowNone,
      USER_ID,
      TEMPLATE_ID_OWNED,
      CONGREGATION_ID,
      Permission.CanAssignProgramParts,
      ResponsibilityScope.Service,
    )

    expect(scopeAskedFor()).toEqual(expect.arrayContaining(['programme', 'service']))
  })

  // The point of the feature: someone who only fills the sono rota must not be
  // able to reassign the public talk. The narrow row simply is not among the ones
  // a programme-scoped question accepts.
  it('never accepts the service delegation for a programme-scoped question', async () => {
    vi.mocked(db.templateResponsible.findFirst).mockResolvedValue(null as never)

    await canEditEvent(db, allowNone, USER_ID, TEMPLATE_ID_OWNED, CONGREGATION_ID, Permission.CanManagePrograms)

    expect(scopeAskedFor()).not.toContain('service')
  })

  it('still short-circuits on the permission before looking at any scope', async () => {
    const result = await canEditEvent(
      db,
      allowOnly(Permission.CanAssignProgramParts),
      USER_ID,
      TEMPLATE_ID_OWNED,
      CONGREGATION_ID,
      Permission.CanAssignProgramParts,
      ResponsibilityScope.Service,
    )

    expect(result).toBe(true)
    expect(db.templateResponsible.findFirst).not.toHaveBeenCalled()
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

  // Guarded rather than left to `roleId: { in: [] }`, which matches nothing today but would
  // give the right answer for the wrong reason. Whether the `in:` filter itself selects the
  // correct rows is pinned in the integration suite — a mock returns what it is told.
  it('returns an empty array without querying when the user holds no roles at all', async () => {
    vi.mocked(db.role.findMany).mockResolvedValue([] as never)
    vi.mocked(db.templateResponsible.findMany).mockResolvedValue([{ templateId: TEMPLATE_ID_OWNED }] as never)

    const result = await getResponsibleTemplateIds(db, USER_ID, CONGREGATION_ID)
    expect(result).toEqual([])
    expect(db.templateResponsible.findMany).not.toHaveBeenCalled()
  })

  // This list drives "which programmes may you create, bulk-release, bulk-delete".
  // A service responsible may do none of those, so the default must stay narrow —
  // widening it here would silently hand them the bulk routes.
  it('asks only for the whole-event delegation by default', async () => {
    vi.mocked(db.templateResponsible.findMany).mockResolvedValue([] as never)

    await getResponsibleTemplateIds(db, USER_ID, CONGREGATION_ID)

    const where = vi.mocked(db.templateResponsible.findMany).mock.calls[0][0]?.where as {
      scope: { in: string[] }
    }
    expect(where.scope.in).toEqual(['programme'])
  })

  it('de-duplicates a template the caller is responsible for under both scopes', async () => {
    vi.mocked(db.templateResponsible.findMany).mockResolvedValue([
      { templateId: TEMPLATE_ID_OWNED },
      { templateId: TEMPLATE_ID_OWNED },
    ] as never)

    const result = await getResponsibleTemplateIds(db, USER_ID, CONGREGATION_ID, ResponsibilityScope.Service)

    expect(result).toEqual([TEMPLATE_ID_OWNED])
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
