import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockErrorIfWouldGoOverLimit = vi.fn()

vi.mock('~/shared/domain/limits.server', () => ({
  // biome-ignore lint/style/useNamingConvention: matching exported class name
  LimitService: class {
    errorIfWouldGoOverLimit = mockErrorIfWouldGoOverLimit
  },
}))

const mockDb = {
  user: { create: vi.fn() },
}

const { createPublisher } = await import('./create-publisher.server')

beforeEach(() => {
  vi.resetAllMocks()
})

const baseCongregation = {
  maxPublishers: null,
  maxTerritories: null,
  maxUsers: null,
  maxStorageBytes: null,
  maxBoardDocuments: null,
} as any

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
  type: 'publisher',
  congregationId: 1,
  phone: '',
  address: '',
}

describe('createPublisher', () => {
  it('creates publisher with provided email', async () => {
    const fake = { id: 1, email: 'jean@example.com' }
    mockDb.user.create.mockResolvedValue(fake as never)

    const result = await createPublisher(mockDb as any, baseCongregation, baseParams, 1)

    expect(result).toEqual(fake)
    const call = mockDb.user.create.mock.calls[0][0]
    expect(call.data.email).toBe('jean@example.com')
  })

  it('creates publisher with placeholder email when email is null', async () => {
    mockDb.user.create.mockResolvedValue({ id: 2 } as never)

    await createPublisher(mockDb as any, baseCongregation, { ...baseParams, email: null }, 1)

    const call = mockDb.user.create.mock.calls[0][0]
    expect(call.data.email).toBe('jean.dupont@placeholder.unitae.app')
  })

  it('saves phone and address to the database', async () => {
    mockDb.user.create.mockResolvedValue({ id: 3 } as never)

    await createPublisher(mockDb as any, baseCongregation, {
      ...baseParams,
      phone: '0612345678',
      address: '5 rue de la Paix',
    }, 1)

    const call = mockDb.user.create.mock.calls[0][0]
    expect(call.data.phone).toBe('0612345678')
    expect(call.data.address).toBe('5 rue de la Paix')
  })

  it('throws LimitError when publisher limit reached', async () => {
    mockErrorIfWouldGoOverLimit.mockRejectedValue(new Error('Limit reached'))

    await expect(createPublisher(mockDb as any, baseCongregation, baseParams, 1)).rejects.toThrow('Limit reached')

    expect(mockDb.user.create).not.toHaveBeenCalled()
  })
})
