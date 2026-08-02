import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PublisherType } from '~/shared/types/publisher-type'

vi.mock('~/shared/domain/audit.server', () => ({
  audit: vi.fn(),
  AuditAction: { RoleAssignmentsSynced: 'role.assignments.synced' },
}))

const { BUILT_IN_ROLE_PREDICATES, syncBuiltInRoleAssignments } = await import('./built-in-roles.server')
const { audit } = await import('~/shared/domain/audit.server')

interface MemberFlags {
  isMale: boolean | null
  isPublisher: boolean
  type: string
  baptismDate: Date | null
  isAnointed: boolean
  isHelder: boolean
  isServant: boolean
  leftAt: Date | null
}

const BASE: MemberFlags = {
  isMale: null,
  isPublisher: false,
  type: PublisherType.Normal,
  baptismDate: null,
  isAnointed: false,
  isHelder: false,
  isServant: false,
  leftAt: null,
}

function makeDb({
  member,
  builtInRoles,
  existingAssignments,
}: {
  member: MemberFlags | null
  builtInRoles: Array<{ id: number; key: string }>
  existingAssignments: Array<{ roleId: number }>
}) {
  return {
    member: { findUnique: vi.fn().mockResolvedValue(member) },
    role: { findMany: vi.fn().mockResolvedValue(builtInRoles) },
    memberRoleAssignment: {
      findMany: vi.fn().mockResolvedValue(existingAssignments),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('BUILT_IN_ROLE_PREDICATES', () => {
  it('member matches every active row (auto-filter excludes leavers)', () => {
    expect(BUILT_IN_ROLE_PREDICATES.member({ ...BASE })).toBe(true)
    expect(BUILT_IN_ROLE_PREDICATES.member({ ...BASE, leftAt: new Date() })).toBe(false)
  })

  it('ministry-school-student matches non-publisher members', () => {
    expect(BUILT_IN_ROLE_PREDICATES['ministry-school-student']({ ...BASE, isPublisher: false })).toBe(true)
    expect(BUILT_IN_ROLE_PREDICATES['ministry-school-student']({ ...BASE, isPublisher: true })).toBe(false)
  })

  it('publisher matches only declared publishers', () => {
    expect(BUILT_IN_ROLE_PREDICATES.publisher({ ...BASE, isPublisher: true })).toBe(true)
    expect(BUILT_IN_ROLE_PREDICATES.publisher({ ...BASE, isPublisher: false })).toBe(false)
  })

  it('baptized requires isPublisher AND a non-null baptismDate', () => {
    expect(BUILT_IN_ROLE_PREDICATES.baptized({ ...BASE, isPublisher: true, baptismDate: new Date() })).toBe(true)
    expect(BUILT_IN_ROLE_PREDICATES.baptized({ ...BASE, isPublisher: true, baptismDate: null })).toBe(false)
    expect(BUILT_IN_ROLE_PREDICATES.baptized({ ...BASE, isPublisher: false, baptismDate: new Date() })).toBe(false)
  })

  it('brother/sister require baptism + gender — but NOT publisher status', () => {
    const baptized = new Date()
    expect(BUILT_IN_ROLE_PREDICATES.brother({ ...BASE, baptismDate: baptized, isMale: true })).toBe(true)
    expect(BUILT_IN_ROLE_PREDICATES.sister({ ...BASE, baptismDate: baptized, isMale: false })).toBe(true)

    // A baptized non-publisher (school student) is still a brother/sister
    expect(BUILT_IN_ROLE_PREDICATES.brother({ ...BASE, isPublisher: false, baptismDate: baptized, isMale: true })).toBe(
      true,
    )

    // No baptism → not a brother/sister
    expect(BUILT_IN_ROLE_PREDICATES.brother({ ...BASE, baptismDate: null, isMale: true })).toBe(false)
    expect(BUILT_IN_ROLE_PREDICATES.sister({ ...BASE, baptismDate: null, isMale: false })).toBe(false)
  })

  it('elder/assistant-servant require baptism + male', () => {
    const baptized = new Date()
    expect(BUILT_IN_ROLE_PREDICATES.elder({ ...BASE, baptismDate: baptized, isMale: true, isHelder: true })).toBe(true)
    expect(
      BUILT_IN_ROLE_PREDICATES['assistant-servant']({ ...BASE, baptismDate: baptized, isMale: true, isServant: true }),
    ).toBe(true)

    // Female with isHelder flag set is still not an elder
    expect(BUILT_IN_ROLE_PREDICATES.elder({ ...BASE, baptismDate: baptized, isMale: false, isHelder: true })).toBe(
      false,
    )

    // No baptism → not an elder
    expect(BUILT_IN_ROLE_PREDICATES.elder({ ...BASE, baptismDate: null, isMale: true, isHelder: true })).toBe(false)
  })

  // Regression lock-in: a Member whose `isMale` flag is null (not yet set,
  // anonymized, or imported without gender) must NEVER hold a male-only
  // built-in role. Predicates use strict `=== true`, not `!== false`.
  it('male-only roles (brother, elder, assistant-servant) reject isMale === null', () => {
    const baptized = new Date()
    const ungendered = { ...BASE, baptismDate: baptized, isMale: null, isHelder: true, isServant: true }

    expect(BUILT_IN_ROLE_PREDICATES.brother(ungendered)).toBe(false)
    expect(BUILT_IN_ROLE_PREDICATES.elder(ungendered)).toBe(false)
    expect(BUILT_IN_ROLE_PREDICATES['assistant-servant'](ungendered)).toBe(false)

    // And `sister` (which uses `=== false`) also rejects null
    expect(BUILT_IN_ROLE_PREDICATES.sister(ungendered)).toBe(false)
  })

  it('anointed requires publisher + baptism + isAnointed', () => {
    const baptized = new Date()
    expect(
      BUILT_IN_ROLE_PREDICATES.anointed({ ...BASE, isPublisher: true, baptismDate: baptized, isAnointed: true }),
    ).toBe(true)
    expect(
      BUILT_IN_ROLE_PREDICATES.anointed({ ...BASE, isPublisher: false, baptismDate: baptized, isAnointed: true }),
    ).toBe(false)
    expect(BUILT_IN_ROLE_PREDICATES.anointed({ ...BASE, isPublisher: true, baptismDate: null, isAnointed: true })).toBe(
      false,
    )
  })

  it('pioneer requires publisher + baptism + permanent or auxiliary type', () => {
    const baptized = new Date()
    expect(
      BUILT_IN_ROLE_PREDICATES.pioneer({
        ...BASE,
        isPublisher: true,
        baptismDate: baptized,
        type: PublisherType.PionnierPermanant,
      }),
    ).toBe(true)
    expect(
      BUILT_IN_ROLE_PREDICATES.pioneer({
        ...BASE,
        isPublisher: true,
        baptismDate: baptized,
        type: PublisherType.PionnierAuxiliaires,
      }),
    ).toBe(true)

    // Normal publisher is not a pioneer
    expect(
      BUILT_IN_ROLE_PREDICATES.pioneer({
        ...BASE,
        isPublisher: true,
        baptismDate: baptized,
        type: PublisherType.Normal,
      }),
    ).toBe(false)
  })

  it('every predicate evaluates to false when the member has left', () => {
    const leaver: MemberFlags = {
      ...BASE,
      isPublisher: true,
      isMale: true,
      baptismDate: new Date(),
      isHelder: true,
      isAnointed: true,
      type: PublisherType.PionnierPermanant,
      leftAt: new Date(),
    }
    for (const predicate of Object.values(BUILT_IN_ROLE_PREDICATES)) {
      expect(predicate(leaver)).toBe(false)
    }
  })
})

describe('syncBuiltInRoleAssignments', () => {
  it('adds missing assignments and audits the diff', async () => {
    const db = makeDb({
      member: { ...BASE, isPublisher: true, isMale: true, isHelder: true, baptismDate: new Date() },
      builtInRoles: [
        { id: 10, key: 'brother' },
        { id: 11, key: 'sister' },
        { id: 12, key: 'elder' },
        { id: 13, key: 'publisher' },
        { id: 14, key: 'member' },
      ],
      existingAssignments: [],
    })

    await syncBuiltInRoleAssignments(db as never, 42, 7, 99)

    expect(db.memberRoleAssignment.createMany).toHaveBeenCalledWith({
      data: [
        { memberId: 42, roleId: 10, congregationId: 7 },
        { memberId: 42, roleId: 12, congregationId: 7 },
        { memberId: 42, roleId: 13, congregationId: 7 },
        { memberId: 42, roleId: 14, congregationId: 7 },
      ],
    })
    expect(db.memberRoleAssignment.deleteMany).not.toHaveBeenCalled()
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'role.assignments.synced',
        congregationId: 7,
        actorId: 99,
        entityType: 'Member',
        entityId: 42,
        metadata: { added: ['brother', 'elder', 'publisher', 'member'], removed: [] },
      }),
    )
  })

  it('scopes the built-in role lookup to the congregation', async () => {
    // Guards against cross-tenant assignments when the caller bypasses RLS
    // (e.g. seed scripts running as the DB owner).
    const db = makeDb({
      member: { ...BASE, isPublisher: true },
      builtInRoles: [{ id: 14, key: 'member' }],
      existingAssignments: [],
    })

    await syncBuiltInRoleAssignments(db as never, 42, 7, 99)

    expect(db.role.findMany).toHaveBeenCalledWith({
      where: { isBuiltIn: true, congregationId: 7 },
      select: { id: true, key: true },
    })
  })

  it('removes stale assignments and audits the diff', async () => {
    const db = makeDb({
      // Sister publisher only (no elder, since female cannot be elder)
      member: { ...BASE, isPublisher: true, isMale: false, baptismDate: new Date() },
      builtInRoles: [
        { id: 10, key: 'brother' },
        { id: 11, key: 'sister' },
        { id: 12, key: 'elder' },
      ],
      existingAssignments: [{ roleId: 10 }, { roleId: 12 }], // currently brother + elder
    })

    await syncBuiltInRoleAssignments(db as never, 42, 7, 99)

    expect(db.memberRoleAssignment.createMany).toHaveBeenCalledWith({
      data: [{ memberId: 42, roleId: 11, congregationId: 7 }],
    })
    expect(db.memberRoleAssignment.deleteMany).toHaveBeenCalledWith({
      where: { memberId: 42, roleId: { in: [10, 12] } },
    })
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { added: ['sister'], removed: ['brother', 'elder'] },
      }),
    )
  })

  it('strips every role when leftAt is set', async () => {
    const db = makeDb({
      member: {
        ...BASE,
        isPublisher: true,
        isMale: true,
        isHelder: true,
        baptismDate: new Date(),
        leftAt: new Date(),
      },
      builtInRoles: [
        { id: 10, key: 'brother' },
        { id: 12, key: 'elder' },
        { id: 13, key: 'publisher' },
      ],
      existingAssignments: [{ roleId: 10 }, { roleId: 12 }, { roleId: 13 }],
    })

    await syncBuiltInRoleAssignments(db as never, 42, 7, 99)

    expect(db.memberRoleAssignment.createMany).not.toHaveBeenCalled()
    expect(db.memberRoleAssignment.deleteMany).toHaveBeenCalledWith({
      where: { memberId: 42, roleId: { in: [10, 12, 13] } },
    })
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { added: [], removed: ['brother', 'elder', 'publisher'] },
      }),
    )
  })

  it('returns without writing or auditing when assignments already match', async () => {
    const db = makeDb({
      member: { ...BASE, isPublisher: true, isMale: true, isHelder: true, baptismDate: new Date() },
      builtInRoles: [
        { id: 10, key: 'brother' },
        { id: 12, key: 'elder' },
        { id: 13, key: 'publisher' },
        { id: 14, key: 'member' },
      ],
      existingAssignments: [{ roleId: 10 }, { roleId: 12 }, { roleId: 13 }, { roleId: 14 }],
    })

    await syncBuiltInRoleAssignments(db as never, 42, 7, 99)

    expect(db.memberRoleAssignment.createMany).not.toHaveBeenCalled()
    expect(db.memberRoleAssignment.deleteMany).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })

  it('skips silently when the member does not exist', async () => {
    const db = makeDb({ member: null, builtInRoles: [], existingAssignments: [] })

    await syncBuiltInRoleAssignments(db as never, 42, 7, null)

    expect(db.role.findMany).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })

  it('ignores roles with unknown keys (defensive against future drift)', async () => {
    const db = makeDb({
      member: { ...BASE, isPublisher: true, isMale: true, baptismDate: new Date() },
      builtInRoles: [
        { id: 10, key: 'brother' },
        { id: 99, key: 'unknown-future-key' },
      ],
      existingAssignments: [],
    })

    await syncBuiltInRoleAssignments(db as never, 42, 7, 99)

    expect(db.memberRoleAssignment.createMany).toHaveBeenCalledWith({
      data: [{ memberId: 42, roleId: 10, congregationId: 7 }],
    })
  })
})
