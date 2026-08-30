import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PublisherType } from '~/shared/types/publisher-type'

const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()
const mockMemberFindUnique = vi.fn().mockResolvedValue(null)
const mockMemberUpdate = vi.fn()
const mockActivityFindMany = vi.fn().mockResolvedValue([])

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    publisherActivity: {
      create: mockCreate,
      update: mockUpdate,
      delete: mockDelete,
      findMany: mockActivityFindMany,
    },
    member: { findUnique: mockMemberFindUnique, update: mockMemberUpdate },
    auditLog: { create: vi.fn() },
  },
}))
vi.mock('~/shared/domain/audit.server', () => ({ AuditAction: {}, audit: vi.fn() }))

const { createPublisherActivity, updatePublisherActivity, deletePublisherActivity } = await import(
  './publisher-activity-mutations.server'
)
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
  mockMemberFindUnique.mockResolvedValue(null)
  mockActivityFindMany.mockResolvedValue([])
})

describe('createPublisherActivity', () => {
  it('creates an activity with correct data', async () => {
    const params = {
      publisherId: 1,
      month: 3,
      year: 2026,
      type: PublisherType.Normal,
      isPublisher: true,
      hours: 15,
      studies: 2,
      notes: 'Good month',
      congregationId: 10,
      actorId: 99,
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
        type: PublisherType.Normal,
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
      type: PublisherType.PionnierAuxiliaires,
      isPublisher: true,
      hours: 30,
      studies: 3,
      notes: 'Updated notes',
    }
    const fakeUpdated = { id: 5, ...params }
    mockUpdate.mockResolvedValue(fakeUpdated as never)

    const result = await updatePublisherActivity(db, 5, 10, 99, params)

    expect(result).toEqual(fakeUpdated)
    expect(mockUpdate).toHaveBeenCalledWith({
      where: {
        id_congregationId: { id: 5, congregationId: 10 },
      },
      data: {
        type: PublisherType.PionnierAuxiliaires,
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

    const result = await deletePublisherActivity(db, 7, 10, 99)

    expect(result).toEqual(fakeDeleted)
    expect(mockDelete).toHaveBeenCalledWith({
      where: {
        id_congregationId: { id: 7, congregationId: 10 },
      },
      include: { publisher: true },
    })
  })
})

describe('updatePublisherActivity — secretary hour credit', () => {
  const base = {
    type: PublisherType.PionnierPermanant,
    isPublisher: true,
    hours: 30,
    studies: 1,
    notes: '',
  }

  it('persists the credit when one is given', async () => {
    mockUpdate.mockResolvedValue({ id: 5, publisherId: 1, isPublisher: true, hours: 30 } as never)

    await updatePublisherActivity(db, 5, 10, 99, { ...base, creditHours: 20 })

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ creditHours: 20 }) }),
    )
  })

  it('clears the credit on an explicit null', async () => {
    mockUpdate.mockResolvedValue({ id: 5, publisherId: 1, isPublisher: true, hours: 30 } as never)

    await updatePublisherActivity(db, 5, 10, 99, { ...base, creditHours: null })

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ creditHours: null }) }),
    )
  })

  it('leaves the stored credit untouched when the caller omits it', async () => {
    // A group responsible saving the report form must never wipe the secretary's credit.
    mockUpdate.mockResolvedValue({ id: 5, publisherId: 1, isPublisher: true, hours: 30 } as never)

    await updatePublisherActivity(db, 5, 10, 99, base)

    const data = mockUpdate.mock.calls[0]?.[0]?.data
    expect(data).not.toHaveProperty('creditHours')
  })
})
