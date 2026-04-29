import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    publisherActivity: { create: mockCreate, update: mockUpdate, delete: mockDelete },
  },
}))

const { createPublisherActivity, updatePublisherActivity, deletePublisherActivity } = await import(
  './publisher-activity-mutations.server'
)
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('createPublisherActivity', () => {
  it('creates an activity with correct data', async () => {
    const params = {
      publisherId: 1,
      month: 3,
      year: 2026,
      type: 'regular',
      isPublisher: true,
      hours: 15,
      studies: 2,
      notes: 'Good month',
      congregationId: 10,
    }
    const fakeActivity = { id: 1, ...params }
    mockCreate.mockResolvedValue(fakeActivity as never)

    const result = await createPublisherActivity(db, params)

    expect(result).toEqual(fakeActivity)
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        publisherId: 1,
        month: 3,
        year: 2026,
        type: 'regular',
        isPublisher: true,
        hours: 15,
        studies: 2,
        notes: 'Good month',
        congregationId: 10,
      },
    })
  })
})

describe('updatePublisherActivity', () => {
  it('updates an activity with correct data', async () => {
    const params = {
      type: 'auxiliary',
      isPublisher: true,
      hours: 30,
      studies: 3,
      notes: 'Updated notes',
    }
    const fakeUpdated = { id: 5, ...params }
    mockUpdate.mockResolvedValue(fakeUpdated as never)

    const result = await updatePublisherActivity(db, 5, 10, params)

    expect(result).toEqual(fakeUpdated)
    expect(mockUpdate).toHaveBeenCalledWith({
      where: {
        // biome-ignore lint/style/useNamingConvention: Prisma compound unique key
        id_congregationId: { id: 5, congregationId: 10 },
      },
      data: {
        type: 'auxiliary',
        isPublisher: true,
        hours: 30,
        studies: 3,
        notes: 'Updated notes',
      },
    })
  })
})

describe('deletePublisherActivity', () => {
  it('deletes the activity and includes publisher', async () => {
    const fakeDeleted = { id: 7, publisher: { id: 1, firstname: 'Jean' } }
    mockDelete.mockResolvedValue(fakeDeleted as never)

    const result = await deletePublisherActivity(db, 7, 10)

    expect(result).toEqual(fakeDeleted)
    expect(mockDelete).toHaveBeenCalledWith({
      where: {
        // biome-ignore lint/style/useNamingConvention: Prisma compound unique key
        id_congregationId: { id: 7, congregationId: 10 },
      },
      include: { publisher: true },
    })
  })
})
