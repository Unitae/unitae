import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PublisherType } from '~/shared/types/publisher-type'

const mockMemberUpdate = vi.fn()
const mockAccountFindUnique = vi.fn()
const mockAccountUpdate = vi.fn()
const mockSync = vi.fn()

vi.mock('~/shared/domain/audit.server', () => ({ AuditAction: {}, audit: vi.fn() }))
vi.mock('~/shared/domain/built-in-roles.server', () => ({
  syncBuiltInRoleAssignments: mockSync,
}))

const mockDb = {
  member: { update: mockMemberUpdate },
  userAccount: { findUnique: mockAccountFindUnique, update: mockAccountUpdate },
}

const { updatePublisher } = await import('./update-publisher.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('updatePublisher', () => {
  const baseParams = {
    firstname: 'Jean',
    lastname: 'Dupont',
    email: 'jean@example.com',
    gender: 'male',
    birthDate: '1990-05-15',
    baptismDate: '2010-03-20',
    isHelder: true,
    isServant: false,
    isAnointed: false,
    groupId: 5,
    type: PublisherType.Normal,
    phone: '0612345678',
    address: '12 rue de la Paix',
  }

  it('updates the member with correct data', async () => {
    const fakeUpdated = { id: 1 }
    mockMemberUpdate.mockResolvedValue(fakeUpdated as never)
    mockAccountFindUnique.mockResolvedValue(null)

    const result = await updatePublisher(mockDb as never, 1, 10, 99, baseParams)

    expect(result).toEqual(fakeUpdated)
    expect(mockMemberUpdate).toHaveBeenCalledWith({
      where: {
        id_congregationId: { id: 1, congregationId: 10 },
      },
      data: {
        firstname: 'Jean',
        lastname: 'Dupont',
        isMale: true,
        baptismDate: new Date('2010-03-20'),
        birthDate: new Date('1990-05-15'),
        isHelder: true,
        isServant: false,
        isAnointed: false,
        publisherGroupId: 5,
        type: PublisherType.Normal,
        address: '12 rue de la Paix',
        phone: '0612345678',
      },
    })
  })

  it('sets isMale to false when gender is not male', async () => {
    mockMemberUpdate.mockResolvedValue({ id: 1 } as never)
    mockAccountFindUnique.mockResolvedValue(null)

    await updatePublisher(mockDb as never, 1, 10, 99, { ...baseParams, gender: 'female' })

    expect(mockMemberUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isMale: false }),
      }),
    )
  })

  it('sets dates to null when not provided', async () => {
    mockMemberUpdate.mockResolvedValue({ id: 1 } as never)
    mockAccountFindUnique.mockResolvedValue(null)

    await updatePublisher(mockDb as never, 1, 10, 99, { ...baseParams, birthDate: null, baptismDate: null })

    expect(mockMemberUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ birthDate: null, baptismDate: null }),
      }),
    )
  })

  it('sets publisherGroupId to null when groupId is NaN', async () => {
    mockMemberUpdate.mockResolvedValue({ id: 1 } as never)
    mockAccountFindUnique.mockResolvedValue(null)

    await updatePublisher(mockDb as never, 1, 10, 99, { ...baseParams, groupId: Number.NaN })

    expect(mockMemberUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ publisherGroupId: null }),
      }),
    )
  })

  it('updates the linked account email when email is provided and an account exists', async () => {
    mockMemberUpdate.mockResolvedValue({ id: 1 } as never)
    mockAccountFindUnique.mockResolvedValue({ id: 42 })

    await updatePublisher(mockDb as never, 1, 10, 99, baseParams)

    expect(mockAccountUpdate).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { email: 'jean@example.com' },
    })
  })

  it('does not touch any account when email is null', async () => {
    mockMemberUpdate.mockResolvedValue({ id: 1 } as never)

    await updatePublisher(mockDb as never, 1, 10, 99, { ...baseParams, email: null })

    expect(mockAccountFindUnique).not.toHaveBeenCalled()
    expect(mockAccountUpdate).not.toHaveBeenCalled()
  })

  it('syncs built-in role assignments after the update', async () => {
    mockMemberUpdate.mockResolvedValue({ id: 1 } as never)
    mockAccountFindUnique.mockResolvedValue(null)

    await updatePublisher(mockDb as never, 1, 10, 99, baseParams)

    expect(mockSync).toHaveBeenCalledWith(mockDb, 1, 10, 99)
  })
})
