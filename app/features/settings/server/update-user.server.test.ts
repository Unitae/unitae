import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { UserUpdated: 'UserUpdated' },
  audit: vi.fn(),
}))

const mockDb = {
  user: { update: vi.fn() },
  congregationUserRole: { deleteMany: vi.fn(), createMany: vi.fn() },
  userRole: { findMany: vi.fn() },
}

const { updateUser } = await import('./update-user.server')
const { audit } = await import('~/shared/domain/audit.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('updateUser', () => {
  it('updates user data', async () => {
    mockDb.user.update.mockResolvedValue({} as never)
    mockDb.congregationUserRole.deleteMany.mockResolvedValue({ count: 0 } as never)
    mockDb.userRole.findMany.mockResolvedValue([] as never)

    await updateUser(mockDb as never, 1, 10, 99, {
      firstname: 'Marie',
      lastname: 'Martin',
      email: 'Marie.Martin@Example.COM',
      active: true,
      roles: [],
    })

    const call = mockDb.user.update.mock.calls[0][0]
    expect(call.data.firstname).toBe('Marie')
    expect(call.data.lastname).toBe('Martin')
    expect(call.data.email).toBe('marie.martin@example.com')
    expect(call.data.active).toBe(true)
  })

  it('deletes existing roles and creates new ones', async () => {
    mockDb.user.update.mockResolvedValue({} as never)
    mockDb.congregationUserRole.deleteMany.mockResolvedValue({ count: 2 } as never)
    mockDb.userRole.findMany.mockResolvedValue([
      { id: 100, key: 'admin' },
      { id: 101, key: 'board-uploader' },
    ] as never)
    mockDb.congregationUserRole.createMany.mockResolvedValue({ count: 2 } as never)

    await updateUser(mockDb as never, 5, 10, 99, {
      firstname: 'Paul',
      lastname: 'Durand',
      email: 'paul@example.com',
      active: true,
      roles: ['admin', 'board-uploader'],
    })

    expect(mockDb.congregationUserRole.deleteMany).toHaveBeenCalledWith({
      where: { userId: 5, congregationId: 10 },
    })

    expect(mockDb.congregationUserRole.createMany).toHaveBeenCalledWith({
      data: [
        { userId: 5, roleId: 100, congregationId: 10 },
        { userId: 5, roleId: 101, congregationId: 10 },
      ],
    })
  })

  it('calls audit with correct action', async () => {
    mockDb.user.update.mockResolvedValue({} as never)
    mockDb.congregationUserRole.deleteMany.mockResolvedValue({ count: 0 } as never)
    mockDb.userRole.findMany.mockResolvedValue([] as never)

    await updateUser(mockDb as never, 7, 10, 99, {
      firstname: 'Luc',
      lastname: 'Bernard',
      email: 'luc@example.com',
      active: false,
      roles: ['admin'],
    })

    expect(vi.mocked(audit)).toHaveBeenCalledWith({
      action: 'UserUpdated',
      congregationId: 10,
      actorId: 99,
      entityType: 'User',
      entityId: 7,
      metadata: { roles: ['admin'] },
    })
  })
})
