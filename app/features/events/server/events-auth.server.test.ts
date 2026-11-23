import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ResponsibilityScope } from '~/features/events/model/responsibility-scope.type'
import type { Permission } from '~/shared/types/permission'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    templateResponsible: { findFirst: vi.fn(), findMany: vi.fn() },
    role: { findMany: vi.fn() },
    event: { findMany: vi.fn() },
    eventKindScheduleTemplate: { findMany: vi.fn() },
    eventPart: { findFirst: vi.fn() },
    eventServicePart: { findFirst: vi.fn() },
    item: { findFirst: vi.fn() },
  },
}))

const { assignmentBelongsToEvent, resolveEventItem, getResponsibleTemplateIds, canManageAnyProgram } = await import(
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

beforeEach(() => {
  vi.resetAllMocks()
  // The caller holds a role by default, so these cases keep testing what they always did:
  // whether that role is the template's responsible. The no-roles case is explicit below.
  vi.mocked(db.role.findMany).mockResolvedValue([{ id: ROLE_ID }] as never)
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

  // Any kind suggesting a schedule template the caller answers for (D28).
  it('returns true for non-manager answering for a schedule template some kind suggests', async () => {
    vi.mocked(db.eventKindScheduleTemplate.findMany).mockResolvedValue([{ eventKindId: TEMPLATE_ID_OWNED }] as never)

    const result = await canManageAnyProgram(db, allowNone, USER_ID, CONGREGATION_ID)
    expect(result).toBe(true)
  })

  it('returns false for non-manager when no responsible records exist', async () => {
    vi.mocked(db.eventKindScheduleTemplate.findMany).mockResolvedValue([] as never)

    const result = await canManageAnyProgram(db, allowNone, USER_ID, CONGREGATION_ID)
    expect(result).toBe(false)
  })
})

describe('assignmentBelongsToEvent', () => {
  const EVENT_ID = 900
  const ASSIGNMENT_ID = 55

  it('accepts a service assignment that sits on the authorised event', async () => {
    vi.mocked(db.item.findFirst).mockResolvedValue({ id: 1 } as never)

    const result = await assignmentBelongsToEvent(db, 'service', ASSIGNMENT_ID, EVENT_ID, CONGREGATION_ID)

    expect(result).toBe(true)
    // The item's own id, among the duties: a part's id asked as a duty is not one.
    expect(vi.mocked(db.item.findFirst).mock.calls[0][0]?.where).toEqual({
      id: ASSIGNMENT_ID,
      eventId: EVENT_ID,
      congregationId: CONGREGATION_ID,
      ...{ AND: [{ schedule: { kind: 'duty' } }] },
    })
  })

  // The exploit this closes: authorised on your own event, posting an assignment
  // id from someone else's. The row exists, it just is not on this event.
  it('refuses an assignment that belongs to another event', async () => {
    vi.mocked(db.item.findFirst).mockResolvedValue(null as never)

    const result = await assignmentBelongsToEvent(db, 'service', ASSIGNMENT_ID, EVENT_ID, CONGREGATION_ID)

    expect(result).toBe(false)
  })

  it('looks a part assignment up among the parts', async () => {
    vi.mocked(db.item.findFirst).mockResolvedValue({ id: 1 } as never)

    const result = await assignmentBelongsToEvent(db, 'part', ASSIGNMENT_ID, EVENT_ID, CONGREGATION_ID)

    expect(result).toBe(true)
    expect(vi.mocked(db.item.findFirst).mock.calls[0][0]?.where).toMatchObject({
      id: ASSIGNMENT_ID,
      ...{ AND: [{ schedule: { kind: 'programme' } }] },
    })
  })

  // `Number(url.searchParams.get('id'))` yields NaN on a missing param, which
  // Prisma rejects at the driver as a 500 rather than a refusal.
  it('refuses a non-integer assignment id without querying', async () => {
    const result = await assignmentBelongsToEvent(db, 'part', Number.NaN, EVENT_ID, CONGREGATION_ID)

    expect(result).toBe(false)
    expect(db.item.findFirst).not.toHaveBeenCalled()
  })
})

// The id a request names, read and checked in one call (plan T12, 5i-b): an item id under the new name, or the old row's
// under the old name, translated through its legacy key, and only when it is an item of that kind on that event.
describe('resolveEventItem', () => {
  const EVENT = 31
  // Item 900 is a part on the event, mirroring old part 12; nothing else exists.
  function answer(where: Record<string, unknown>) {
    const kindOf = (where.AND as { schedule: { kind: string } }[] | undefined)?.[0]?.schedule.kind
    if ('legacyPartId' in where) return where.legacyPartId === 12 ? { id: 900 } : null
    if ('legacyServiceId' in where) return null
    return where.id === 900 && where.eventId === EVENT && kindOf === 'programme' ? { id: 900 } : null
  }

  beforeEach(() => {
    vi.mocked(db.item.findFirst).mockImplementation((async ({ where }: { where: Record<string, unknown> }) =>
      answer(where)) as never)
  })

  it('takes an item of the kind asked on the event, by its id or its old row’s', async () => {
    expect(await resolveEventItem(db, { itemId: '900', legacyId: null }, 'part', EVENT, CONGREGATION_ID)).toBe(900)
    expect(await resolveEventItem(db, { itemId: null, legacyId: '12' }, 'part', EVENT, CONGREGATION_ID)).toBe(900)
  })

  it('refuses the same item asked as the other kind, on another event, or an id naming nothing', async () => {
    expect(await resolveEventItem(db, { itemId: '900', legacyId: null }, 'service', EVENT, CONGREGATION_ID)).toBeNull()
    expect(await resolveEventItem(db, { itemId: null, legacyId: '12' }, 'service', EVENT, CONGREGATION_ID)).toBeNull()
    expect(await resolveEventItem(db, { itemId: '900', legacyId: null }, 'part', 32, CONGREGATION_ID)).toBeNull()
    expect(await resolveEventItem(db, { itemId: null, legacyId: null }, 'part', EVENT, CONGREGATION_ID)).toBeNull()
    expect(await resolveEventItem(db, { itemId: 'x', legacyId: '12' }, 'part', EVENT, CONGREGATION_ID)).toBeNull()
  })
})
