import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockCreate = vi.fn()
const mockDelete = vi.fn()

vi.mock('~/shared/libs/db.server', () => ({
  db: {
    publisherGroup: { create: mockCreate, delete: mockDelete },
  },
}))

const { createPublisherGroup, deletePublisherGroup } = await import('./publisher-group-mutations.server')
const { db } = await import('~/shared/libs/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('createPublisherGroup', () => {
  it('creates a group with responsible and deputy', async () => {
    const params = {
      name: 'Groupe Nord',
      address: '5 avenue Victor Hugo',
      responsibleId: 10,
      deputyId: 20,
      congregationId: 1,
    }
    const fakeGroup = { id: 1, ...params }
    mockCreate.mockResolvedValue(fakeGroup as never)

    const result = await createPublisherGroup(db, params)

    expect(result).toEqual(fakeGroup)
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        name: 'Groupe Nord',
        adress: '5 avenue Victor Hugo',
        deputyId: 20,
        responsibleId: 10,
        members: { connect: [{ id: 10 }, { id: 20 }] },
        congregationId: 1,
      },
    })
  })

  it('creates a group without deputy', async () => {
    const params = {
      name: 'Groupe Sud',
      address: '10 rue Pasteur',
      responsibleId: 10,
      deputyId: null,
      congregationId: 1,
    }
    const fakeGroup = { id: 2, ...params }
    mockCreate.mockResolvedValue(fakeGroup as never)

    const result = await createPublisherGroup(db, params)

    expect(result).toEqual(fakeGroup)
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        name: 'Groupe Sud',
        adress: '10 rue Pasteur',
        deputyId: null,
        responsibleId: 10,
        members: { connect: [{ id: 10 }] },
        congregationId: 1,
      },
    })
  })
})

describe('deletePublisherGroup', () => {
  it('deletes the group by id and congregationId', async () => {
    const fakeDeleted = { id: 5, name: 'Groupe Ouest' }
    mockDelete.mockResolvedValue(fakeDeleted as never)

    const result = await deletePublisherGroup(db, 5, 1)

    expect(result).toEqual(fakeDeleted)
    expect(mockDelete).toHaveBeenCalledWith({
      where: {
        // biome-ignore lint/style/useNamingConvention: Prisma compound unique key
        id_congregationId: { id: 5, congregationId: 1 },
      },
    })
  })
})
