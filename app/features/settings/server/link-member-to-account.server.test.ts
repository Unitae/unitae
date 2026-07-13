import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConflictError, NotFoundError } from '~/shared/errors/app-error.server'
import type { AccountId } from '~/shared/types/branded'
import { PublisherType } from '~/shared/types/publisher-type'

const mockErrorIfWouldGoOverLimit = vi.fn()
const mockCreateDirect = vi.fn()
const mockAudit = vi.fn()

vi.mock('~/shared/domain/limits.server', () => ({
  LimitService: class {
    errorIfWouldGoOverLimit = mockErrorIfWouldGoOverLimit
  },
}))
vi.mock('~/features/publishers/index.server', () => ({
  memberAggregate: { createDirect: mockCreateDirect },
}))
vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { AccountLinkedToMember: 'account.linked_to_member' },
  audit: mockAudit,
}))

const mockDb = {
  userAccount: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
}
// biome-ignore lint/suspicious/noExplicitAny: partial mocked transaction client
const dbCast = mockDb as any

const { linkMemberToAccount } = await import('./link-member-to-account.server')

beforeEach(() => {
  vi.resetAllMocks()
})

const baseParams = {
  accountId: 5 as AccountId,
  congregationId: 42,
  actorId: 99,
  isMale: null,
  birthDate: null,
  baptismDate: null,
  isPublisher: false,
  type: PublisherType.Normal,
  isHelder: false,
  isServant: false,
  isAnointed: false,
  publisherGroupId: null,
  phone: '',
  address: '',
}

const baseCongregation = { id: 42, name: 'Cong', maxMembers: null } as unknown as Parameters<
  typeof linkMemberToAccount
>[1]

describe('linkMemberToAccount', () => {
  it('throws NotFoundError when the account does not exist', async () => {
    mockDb.userAccount.findFirst.mockResolvedValue(null)
    await expect(linkMemberToAccount(dbCast, baseCongregation, baseParams)).rejects.toThrow(NotFoundError)
  })

  it('throws ConflictError when the account is already linked to a Member', async () => {
    mockDb.userAccount.findFirst.mockResolvedValue({ id: 5, memberId: 77, firstname: 'A', lastname: 'B' })
    await expect(linkMemberToAccount(dbCast, baseCongregation, baseParams)).rejects.toThrow(ConflictError)
  })

  it('checks the members limit before creating the member', async () => {
    mockDb.userAccount.findFirst.mockResolvedValue({ id: 5, memberId: null, firstname: 'A', lastname: 'B' })
    mockCreateDirect.mockResolvedValue({ id: 10 })

    await linkMemberToAccount(dbCast, baseCongregation, baseParams)

    expect(mockErrorIfWouldGoOverLimit).toHaveBeenCalledWith('members')
  })

  it('falls back to the account display firstname/lastname when the form left them blank', async () => {
    mockDb.userAccount.findFirst.mockResolvedValue({ id: 5, memberId: null, firstname: 'Prev', lastname: 'Prev' })
    mockCreateDirect.mockResolvedValue({ id: 10 })

    await linkMemberToAccount(dbCast, baseCongregation, baseParams)

    expect(mockCreateDirect).toHaveBeenCalledWith(
      dbCast,
      42,
      99,
      expect.objectContaining({ firstname: 'Prev', lastname: 'Prev' }),
    )
  })

  it('uses form-provided firstname/lastname when supplied', async () => {
    mockDb.userAccount.findFirst.mockResolvedValue({ id: 5, memberId: null, firstname: 'Prev', lastname: 'Prev' })
    mockCreateDirect.mockResolvedValue({ id: 10 })

    await linkMemberToAccount(dbCast, baseCongregation, { ...baseParams, firstname: 'New', lastname: 'Name' })

    expect(mockCreateDirect).toHaveBeenCalledWith(
      dbCast,
      42,
      99,
      expect.objectContaining({ firstname: 'New', lastname: 'Name' }),
    )
  })

  it('links the created Member back to the account and clears the display-name fallback fields', async () => {
    mockDb.userAccount.findFirst.mockResolvedValue({ id: 5, memberId: null, firstname: 'Prev', lastname: 'Prev' })
    mockCreateDirect.mockResolvedValue({ id: 10 })

    await linkMemberToAccount(dbCast, baseCongregation, baseParams)

    expect(mockDb.userAccount.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { memberId: 10, firstname: null, lastname: null },
    })
  })

  it('emits an audit event on success', async () => {
    mockDb.userAccount.findFirst.mockResolvedValue({ id: 5, memberId: null, firstname: 'A', lastname: 'B' })
    mockCreateDirect.mockResolvedValue({ id: 10 })

    await linkMemberToAccount(dbCast, baseCongregation, baseParams)

    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'account.linked_to_member',
        entityType: 'UserAccount',
        entityId: 5,
        metadata: { memberId: 10, direction: 'account_to_member' },
      }),
    )
  })

  it('returns { memberId, accountId } on success', async () => {
    mockDb.userAccount.findFirst.mockResolvedValue({ id: 5, memberId: null, firstname: 'A', lastname: 'B' })
    mockCreateDirect.mockResolvedValue({ id: 10 })

    const result = await linkMemberToAccount(dbCast, baseCongregation, baseParams)

    expect(result).toEqual({ memberId: 10, accountId: 5 })
  })
})
