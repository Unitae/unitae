import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PublisherType } from '~/shared/types/publisher-type'

const mockErrorIfWouldGoOverLimit = vi.fn()

vi.mock('~/shared/domain/limits.server', () => ({
  LimitService: class {
    errorIfWouldGoOverLimit = mockErrorIfWouldGoOverLimit
  },
}))
vi.mock('~/shared/domain/audit.server', () => ({ AuditAction: {}, audit: vi.fn() }))
vi.mock('~/shared/domain/built-in-roles.server', () => ({ syncBuiltInRoleAssignments: vi.fn() }))
vi.mock('~/features/authentication/server/invalidate-user-password.server', () => ({
  createPasswordResetToken: vi.fn().mockResolvedValue('token'),
}))

const mockDb = {
  member: { create: vi.fn() },
  userAccount: { create: vi.fn() },
}

const { createMember } = await import('./create-member.server')

beforeEach(() => {
  vi.resetAllMocks()
})

const baseCongregation = {
  maxPublishers: null,
  maxTerritories: null,
  maxUsers: null,
  maxStorageBytes: null,
  maxBoardDocuments: null,
} as never

const baseParams = {
  firstname: 'Jean',
  lastname: 'Dupont',
  email: 'jean@example.com',
  gender: 'male',
  birthDate: null,
  baptismDate: null,
  isHelder: false,
  isServant: false,
  isAnointed: false,
  groupId: null,
  type: PublisherType.Normal,
  congregationId: 1,
  phone: '',
  address: '',
  actorId: 99,
}

describe('createMember', () => {
  it('creates a Member and a linked UserAccount when email is provided', async () => {
    const member = { id: 1, firstname: 'Jean', lastname: 'Dupont' }
    const account = { id: 5, memberId: 1, email: 'jean@example.com' }
    mockDb.member.create.mockResolvedValue(member as never)
    mockDb.userAccount.create.mockResolvedValue(account as never)

    const result = await createMember(mockDb as never, baseCongregation, baseParams)

    expect(result).toEqual(member)
    const memberCall = mockDb.member.create.mock.calls[0][0]
    expect(memberCall.data.firstname).toBe('Jean')
    expect(memberCall.data.isPublisher).toBe(true)
    const accountCall = mockDb.userAccount.create.mock.calls[0][0]
    expect(accountCall.data.email).toBe('jean@example.com')
    expect(accountCall.data.memberId).toBe(1)
  })

  it('creates a Member only (no UserAccount) when email is null', async () => {
    mockDb.member.create.mockResolvedValue({ id: 2 } as never)

    await createMember(mockDb as never, baseCongregation, { ...baseParams, email: null })

    expect(mockDb.member.create).toHaveBeenCalledOnce()
    expect(mockDb.userAccount.create).not.toHaveBeenCalled()
  })

  it('saves phone and address on the Member', async () => {
    mockDb.member.create.mockResolvedValue({ id: 3 } as never)

    await createMember(mockDb as never, baseCongregation, {
      ...baseParams,
      email: null,
      phone: '0612345678',
      address: '5 rue de la Paix',
    })

    const call = mockDb.member.create.mock.calls[0][0]
    expect(call.data.phone).toBe('0612345678')
    expect(call.data.address).toBe('5 rue de la Paix')
  })

  it('throws LimitError when member limit reached', async () => {
    mockErrorIfWouldGoOverLimit.mockRejectedValue(new Error('Limit reached'))

    await expect(createMember(mockDb as never, baseCongregation, baseParams)).rejects.toThrow('Limit reached')

    expect(mockDb.member.create).not.toHaveBeenCalled()
  })
})
