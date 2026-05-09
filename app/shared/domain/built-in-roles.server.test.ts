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
  it('male requires isPublisher AND isMale === true', () => {
    expect(BUILT_IN_ROLE_PREDICATES.male({ ...BASE, isPublisher: true, isMale: true })).toBe(true)
    expect(BUILT_IN_ROLE_PREDICATES.male({ ...BASE, isPublisher: true, isMale: false })).toBe(false)
    expect(BUILT_IN_ROLE_PREDICATES.male({ ...BASE, isPublisher: true, isMale: null })).toBe(false)
    expect(BUILT_IN_ROLE_PREDICATES.male({ ...BASE, isPublisher: false, isMale: true })).toBe(false)
  })

  it('female requires isPublisher AND isMale === false', () => {
    expect(BUILT_IN_ROLE_PREDICATES.female({ ...BASE, isPublisher: true, isMale: false })).toBe(true)
    expect(BUILT_IN_ROLE_PREDICATES.female({ ...BASE, isPublisher: true, isMale: true })).toBe(false)
    expect(BUILT_IN_ROLE_PREDICATES.female({ ...BASE, isPublisher: true, isMale: null })).toBe(false)
    expect(BUILT_IN_ROLE_PREDICATES.female({ ...BASE, isPublisher: false, isMale: false })).toBe(false)
  })

  it('baptized requires isPublisher AND a non-null baptismDate', () => {
    expect(BUILT_IN_ROLE_PREDICATES.baptized({ ...BASE, isPublisher: true, baptismDate: new Date() })).toBe(true)
    expect(BUILT_IN_ROLE_PREDICATES.baptized({ ...BASE, isPublisher: true, baptismDate: null })).toBe(false)
    expect(BUILT_IN_ROLE_PREDICATES.baptized({ ...BASE, isPublisher: false, baptismDate: new Date() })).toBe(false)
  })

  it('publisher / elder / assistant-servant / anointed all require isPublisher', () => {
    expect(BUILT_IN_ROLE_PREDICATES.publisher({ ...BASE, isPublisher: true })).toBe(true)
    expect(BUILT_IN_ROLE_PREDICATES.elder({ ...BASE, isPublisher: true, isHelder: true })).toBe(true)
    expect(BUILT_IN_ROLE_PREDICATES['assistant-servant']({ ...BASE, isPublisher: true, isServant: true })).toBe(true)
    expect(BUILT_IN_ROLE_PREDICATES.anointed({ ...BASE, isPublisher: true, isAnointed: true })).toBe(true)

    // Non-publisher accounts never match the domain roles, even if their boolean is set.
    expect(BUILT_IN_ROLE_PREDICATES.elder({ ...BASE, isPublisher: false, isHelder: true })).toBe(false)
    expect(BUILT_IN_ROLE_PREDICATES['assistant-servant']({ ...BASE, isPublisher: false, isServant: true })).toBe(false)
    expect(BUILT_IN_ROLE_PREDICATES.anointed({ ...BASE, isPublisher: false, isAnointed: true })).toBe(false)
  })
})

describe('syncBuiltInRoleAssignments', () => {
  it('adds missing assignments and skips audit when nothing was assigned before', async () => {
    const db = makeDb({
      user: { ...BASE, isPublisher: true, isMale: true, isHelder: true },
      builtInRoles: [
        { id: 10, key: 'male' },
        { id: 11, key: 'female' },
        { id: 12, key: 'elder' },
        { id: 13, key: 'publisher' },
      ],
      existingAssignments: [],
    })

    await syncBuiltInRoleAssignments(db as never, 42, 7, 99)

    expect(db.userRoleAssignment.createMany).toHaveBeenCalledWith({
      data: [
        { userId: 42, roleId: 10, congregationId: 7 },
        { userId: 42, roleId: 12, congregationId: 7 },
        { userId: 42, roleId: 13, congregationId: 7 },
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
        metadata: { added: ['male', 'elder', 'publisher'], removed: [] },
      }),
    )
  })

  it('removes stale assignments and audits the diff', async () => {
    const db = makeDb({
      user: { ...BASE, isPublisher: true, isMale: false }, // female publisher only
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

  it('strips every domain role when isPublisher flips to false', async () => {
    const db = makeDb({
      user: { ...BASE, isPublisher: false, isMale: true, isHelder: true },
      builtInRoles: [
        { id: 10, key: 'male' },
        { id: 12, key: 'elder' },
        { id: 13, key: 'publisher' },
      ],
      existingAssignments: [{ roleId: 10 }, { roleId: 12 }, { roleId: 13 }],
    })

    await syncBuiltInRoleAssignments(db as never, 42, 7, 99)

    expect(db.userRoleAssignment.createMany).not.toHaveBeenCalled()
    expect(db.userRoleAssignment.deleteMany).toHaveBeenCalledWith({
      where: { userId: 42, roleId: { in: [10, 12, 13] } },
    })
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { added: [], removed: ['male', 'elder', 'publisher'] },
      }),
    )
  })

  it('returns without writing or auditing when assignments already match', async () => {
    const db = makeDb({
      user: { ...BASE, isPublisher: true, isMale: true, isHelder: true },
      builtInRoles: [
        { id: 10, key: 'male' },
        { id: 12, key: 'elder' },
        { id: 13, key: 'publisher' },
      ],
      existingAssignments: [{ roleId: 10 }, { roleId: 12 }, { roleId: 13 }],
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
      user: { ...BASE, isPublisher: true, isMale: true },
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
