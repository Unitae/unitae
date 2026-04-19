import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockUpdate = vi.fn()

vi.mock('~/shared/libs/db.server', () => ({
  db: {
    user: { update: mockUpdate },
  },
}))

const { updatePublisher } = await import('./update-publisher.server')
const { db } = await import('~/shared/libs/db.server')

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
    type: 'publisher',
    phone: '0612345678',
    address: '12 rue de la Paix',
  }

  it('updates the publisher with correct data', async () => {
    const fakeUpdated = { id: 1, ...baseParams }
    mockUpdate.mockResolvedValue(fakeUpdated as never)

    const result = await updatePublisher(db, 1, 10, baseParams)

    expect(result).toEqual(fakeUpdated)
    expect(mockUpdate).toHaveBeenCalledWith({
      where: {
        // biome-ignore lint/style/useNamingConvention: Prisma compound unique key
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
        email: 'jean@example.com',
        type: 'publisher',
        address: '12 rue de la Paix',
        phone: '0612345678',
      },
    })
  })

  it('sets isMale to false when gender is not male', async () => {
    const params = { ...baseParams, gender: 'female' }
    mockUpdate.mockResolvedValue({ id: 1 } as never)

    await updatePublisher(db, 1, 10, params)

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isMale: false }),
      }),
    )
  })

  it('sets dates to null when not provided', async () => {
    const params = { ...baseParams, birthDate: null, baptismDate: null }
    mockUpdate.mockResolvedValue({ id: 1 } as never)

    await updatePublisher(db, 1, 10, params)

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ birthDate: null, baptismDate: null }),
      }),
    )
  })

  it('sets publisherGroupId to null when groupId is NaN', async () => {
    const params = { ...baseParams, groupId: Number.NaN }
    mockUpdate.mockResolvedValue({ id: 1 } as never)

    await updatePublisher(db, 1, 10, params)

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ publisherGroupId: null }),
      }),
    )
  })

  it('does not include email in data when email is null', async () => {
    const params = { ...baseParams, email: null }
    mockUpdate.mockResolvedValue({ id: 1 } as never)

    await updatePublisher(db, 1, 10, params)

    const callData = mockUpdate.mock.calls[0][0].data
    expect(callData).not.toHaveProperty('email')
  })
})
