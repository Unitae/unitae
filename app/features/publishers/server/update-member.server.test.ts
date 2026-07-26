import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PublisherType } from '~/shared/types/publisher-type'

const mockMemberFindFirst = vi.fn()
const mockMemberUpdate = vi.fn()
const mockAccountFindFirst = vi.fn()
const mockAccountUpdate = vi.fn()
const mockSync = vi.fn()

vi.mock('~/shared/domain/audit.server', () => ({ AuditAction: {}, audit: vi.fn() }))
vi.mock('~/shared/domain/built-in-roles.server', () => ({
  syncBuiltInRoleAssignments: mockSync,
}))

const mockDb = {
  // aggregate.updateIdentity pre-loads the identity-flag snapshot before the
  // update so `haveIdentityFlagsChanged` can decide whether sync must fire.
  member: { findFirst: mockMemberFindFirst, update: mockMemberUpdate },
  userAccount: { findFirst: mockAccountFindFirst, update: mockAccountUpdate },
}

const { updateMember } = await import('./update-member.server')

const BEFORE_IDENTITY = {
  isPublisher: true,
  type: 'Normal',
  isMale: false,
  baptismDate: null,
  isAnointed: false,
  isHelder: false,
  isServant: false,
  leftAt: null,
}

beforeEach(() => {
  vi.resetAllMocks()
  mockMemberFindFirst.mockResolvedValue(BEFORE_IDENTITY)
})

describe('updateMember', () => {
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
    mockAccountFindFirst.mockResolvedValue(null)

    const result = await updateMember(mockDb as never, 1, 10, 99, baseParams)

    expect(result).toEqual(fakeUpdated)
    expect(mockMemberUpdate).toHaveBeenCalledWith({
      where: {
        id_congregationId: { id: 1, congregationId: 10 },
      },
      data: {
        firstname: 'Jean',
        lastname: 'Dupont',
        firstnameNormalized: 'jean',
        lastnameNormalized: 'dupont',
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
    mockAccountFindFirst.mockResolvedValue(null)

    await updateMember(mockDb as never, 1, 10, 99, { ...baseParams, gender: 'female' })

    expect(mockMemberUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isMale: false }),
      }),
    )
  })

  it('sets dates to null when not provided', async () => {
    mockMemberUpdate.mockResolvedValue({ id: 1 } as never)
    mockAccountFindFirst.mockResolvedValue(null)

    await updateMember(mockDb as never, 1, 10, 99, { ...baseParams, birthDate: null, baptismDate: null })

    expect(mockMemberUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ birthDate: null, baptismDate: null }),
      }),
    )
  })

  it('sets publisherGroupId to null when groupId is NaN', async () => {
    mockMemberUpdate.mockResolvedValue({ id: 1 } as never)
    mockAccountFindFirst.mockResolvedValue(null)

    await updateMember(mockDb as never, 1, 10, 99, { ...baseParams, groupId: Number.NaN })

    expect(mockMemberUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ publisherGroupId: null }),
      }),
    )
  })

  it('updates the linked account email when email is provided and an account exists', async () => {
    mockMemberUpdate.mockResolvedValue({ id: 1 } as never)
    mockAccountFindFirst.mockResolvedValue({ id: 42 })

    await updateMember(mockDb as never, 1, 10, 99, baseParams)

    expect(mockAccountFindFirst).toHaveBeenCalledWith({ where: { memberId: 1, congregationId: 10 } })
    expect(mockAccountUpdate).toHaveBeenCalledWith({
      where: { id_congregationId: { id: 42, congregationId: 10 } },
      data: { email: 'jean@example.com' },
    })
  })

  it('does not touch any account when email is null', async () => {
    mockMemberUpdate.mockResolvedValue({ id: 1 } as never)

    await updateMember(mockDb as never, 1, 10, 99, { ...baseParams, email: null })

    expect(mockAccountFindFirst).not.toHaveBeenCalled()
    expect(mockAccountUpdate).not.toHaveBeenCalled()
  })

  it('syncs built-in role assignments when an identity flag changed', async () => {
    // Before: not a helder. baseParams flips isHelder to true → sync must fire.
    const AFTER = { ...BEFORE_IDENTITY, isHelder: true, isMale: true, baptismDate: new Date('2010-03-20') }
    mockMemberUpdate.mockResolvedValue({ id: 1, ...AFTER } as never)
    mockAccountFindFirst.mockResolvedValue(null)

    await updateMember(mockDb as never, 1, 10, 99, baseParams)

    expect(mockSync).toHaveBeenCalledWith(mockDb, 1, 10, 99)
  })

  it('skips the sync when only non-identity fields (phone/address/name) changed', async () => {
    // Before AND after keep the same 8 identity flags. Only names / phone / address differ.
    mockMemberUpdate.mockResolvedValue({ id: 1, ...BEFORE_IDENTITY } as never)
    mockAccountFindFirst.mockResolvedValue(null)

    await updateMember(mockDb as never, 1, 10, 99, {
      ...baseParams,
      email: null,
      gender: 'female', // matches BEFORE.isMale=false
      baptismDate: null, // matches BEFORE
      isHelder: false, // matches BEFORE
      firstname: 'Renamed',
      phone: '0700000000',
      address: 'New address',
    })

    expect(mockSync).not.toHaveBeenCalled()
  })
})
