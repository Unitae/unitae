import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/domain/audit.server', () => ({
  audit: vi.fn(),
  AuditAction: { RoleAssignmentsSynced: 'role.assignments.synced' },
}))

const { BUILT_IN_ROLE_PREDICATES, syncBuiltInRoleAssignments } = await import('./built-in-roles.server')
const { audit } = await import('~/shared/domain/audit.server')

interface Booleans {
  isMale: boolean | null
  isPublisher: boolean
  baptismDate: Date | null
  isAnointed: boolean
  isHelder: boolean
  isServant: boolean
}

const BASE: Booleans = {
  isMale: null,
  isPublisher: false,
  baptismDate: null,
  isAnointed: false,
  isHelder: false,
  isServant: false,
}

function makeDb({
  user,
  builtInRoles,
  existingAssignments,
}: {
  user: Booleans | null
  builtInRoles: Array<{ id: number; key: string }>
  existingAssignments: Array<{ roleId: number }>
}) {
  return {
    user: { findUnique: vi.fn().mockResolvedValue(user) },
    role: { findMany: vi.fn().mockResolvedValue(builtInRoles) },
    userRoleAssignment: {
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
  it('male requires isMale === true (null is not male)', () => {
    expect(BUILT_IN_ROLE_PREDICATES.male({ ...BASE, isMale: true })).toBe(true)
    expect(BUILT_IN_ROLE_PREDICATES.male({ ...BASE, isMale: false })).toBe(false)
    expect(BUILT_IN_ROLE_PREDICATES.male({ ...BASE, isMale: null })).toBe(false)
  })

  it('female requires isMale === false (null is not female)', () => {
    expect(BUILT_IN_ROLE_PREDICATES.female({ ...BASE, isMale: false })).toBe(true)
    expect(BUILT_IN_ROLE_PREDICATES.female({ ...BASE, isMale: true })).toBe(false)
    expect(BUILT_IN_ROLE_PREDICATES.female({ ...BASE, isMale: null })).toBe(false)
  })

  it('baptized requires a non-null baptismDate', () => {
    expect(BUILT_IN_ROLE_PREDICATES.baptized({ ...BASE, baptismDate: new Date() })).toBe(true)
    expect(BUILT_IN_ROLE_PREDICATES.baptized({ ...BASE, baptismDate: null })).toBe(false)
  })

  it('publisher / elder / assistant-servant / anointed read their boolean fields', () => {
    expect(BUILT_IN_ROLE_PREDICATES.publisher({ ...BASE, isPublisher: true })).toBe(true)
    expect(BUILT_IN_ROLE_PREDICATES.elder({ ...BASE, isHelder: true })).toBe(true)
    expect(BUILT_IN_ROLE_PREDICATES['assistant-servant']({ ...BASE, isServant: true })).toBe(true)
    expect(BUILT_IN_ROLE_PREDICATES.anointed({ ...BASE, isAnointed: true })).toBe(true)
  })
})

describe('syncBuiltInRoleAssignments', () => {
  it('adds missing assignments and skips audit when nothing was assigned before', async () => {
    const db = makeDb({
      user: { ...BASE, isMale: true, isHelder: true },
      builtInRoles: [
        { id: 10, key: 'male' },
        { id: 11, key: 'female' },
        { id: 12, key: 'elder' },
      ],
      existingAssignments: [],
    })

    await syncBuiltInRoleAssignments(db as never, 42, 7, 99)

    expect(db.userRoleAssignment.createMany).toHaveBeenCalledWith({
      data: [
        { userId: 42, roleId: 10, congregationId: 7 },
        { userId: 42, roleId: 12, congregationId: 7 },
      ],
    })
    expect(db.userRoleAssignment.deleteMany).not.toHaveBeenCalled()
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'role.assignments.synced',
        congregationId: 7,
        actorId: 99,
        entityType: 'User',
        entityId: 42,
        metadata: { added: ['male', 'elder'], removed: [] },
      }),
    )
  })

  it('removes stale assignments and audits the diff', async () => {
    const db = makeDb({
      user: { ...BASE, isMale: false }, // female only
      builtInRoles: [
        { id: 10, key: 'male' },
        { id: 11, key: 'female' },
        { id: 12, key: 'elder' },
      ],
      existingAssignments: [{ roleId: 10 }, { roleId: 12 }], // currently male + elder
    })

    await syncBuiltInRoleAssignments(db as never, 42, 7, 99)

    expect(db.userRoleAssignment.createMany).toHaveBeenCalledWith({
      data: [{ userId: 42, roleId: 11, congregationId: 7 }],
    })
    expect(db.userRoleAssignment.deleteMany).toHaveBeenCalledWith({
      where: { userId: 42, roleId: { in: [10, 12] } },
    })
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { added: ['female'], removed: ['male', 'elder'] },
      }),
    )
  })

  it('returns without writing or auditing when assignments already match', async () => {
    const db = makeDb({
      user: { ...BASE, isMale: true, isHelder: true },
      builtInRoles: [
        { id: 10, key: 'male' },
        { id: 12, key: 'elder' },
      ],
      existingAssignments: [{ roleId: 10 }, { roleId: 12 }],
    })

    await syncBuiltInRoleAssignments(db as never, 42, 7, 99)

    expect(db.userRoleAssignment.createMany).not.toHaveBeenCalled()
    expect(db.userRoleAssignment.deleteMany).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })

  it('skips silently when the user does not exist', async () => {
    const db = makeDb({ user: null, builtInRoles: [], existingAssignments: [] })

    await syncBuiltInRoleAssignments(db as never, 42, 7, null)

    expect(db.role.findMany).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })

  it('ignores roles with unknown keys (defensive against future drift)', async () => {
    const db = makeDb({
      user: { ...BASE, isMale: true },
      builtInRoles: [
        { id: 10, key: 'male' },
        { id: 99, key: 'unknown-future-key' },
      ],
      existingAssignments: [],
    })

    await syncBuiltInRoleAssignments(db as never, 42, 7, 99)

    expect(db.userRoleAssignment.createMany).toHaveBeenCalledWith({
      data: [{ userId: 42, roleId: 10, congregationId: 7 }],
    })
  })
})
