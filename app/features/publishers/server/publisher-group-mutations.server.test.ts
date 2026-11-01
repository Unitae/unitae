import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockCreate = vi.fn()
const mockDelete = vi.fn()

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    publisherGroup: { create: mockCreate, delete: mockDelete },
    auditLog: { create: vi.fn() },
  },
}))
vi.mock('~/shared/domain/audit.server', () => ({ AuditAction: {}, audit: vi.fn() }))
vi.mock('./group-leaders.server', () => ({ assertGroupLeaders: vi.fn() }))
vi.mock('./member.aggregate', () => ({ setGroup: vi.fn() }))

const { createPublisherGroup, deletePublisherGroup } = await import('./publisher-group-mutations.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const { assertGroupLeaders } = await import('./group-leaders.server')
const { setGroup } = await import('./member.aggregate')
const { ValidationError } = await import('~/shared/errors/app-error.server')

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
      actorId: 99,
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
        congregationId: 1,
      },
    })
    // Choosing someone as overseer or deputy moves them into the group, through the aggregate.
    expect(vi.mocked(setGroup).mock.calls).toEqual([
      [db, 10, 1, 1, 99],
      [db, 20, 1, 1, 99],
    ])
  })

  it('creates a group without deputy', async () => {
    const params = {
      name: 'Groupe Sud',
      address: '10 rue Pasteur',
      responsibleId: 10,
      deputyId: null,
      congregationId: 1,
      actorId: 99,
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
        congregationId: 1,
      },
    })
    expect(vi.mocked(setGroup).mock.calls).toEqual([[db, 10, 1, 2, 99]])
  })
})

describe('createPublisherGroup — leaders', () => {
  // Regression: the form's choices were the only guard; the server created whatever it was sent.
  it('checks the leaders before creating the group', async () => {
    vi.mocked(assertGroupLeaders).mockRejectedValue(new ValidationError('responsible', 'not eligible'))

    await expect(
      createPublisherGroup(db, {
        name: 'Nord',
        address: 'x',
        responsibleId: 10,
        deputyId: null,
        congregationId: 1,
        actorId: 99,
      }),
    ).rejects.toBeInstanceOf(ValidationError)

    expect(assertGroupLeaders).toHaveBeenCalledWith(db, 1, { responsibleId: 10, deputyId: null })
    expect(mockCreate).not.toHaveBeenCalled()
  })
})

describe('deletePublisherGroup', () => {
  it('deletes the group by id and congregationId', async () => {
    const fakeDeleted = { id: 5, name: 'Groupe Ouest' }
    mockDelete.mockResolvedValue(fakeDeleted as never)

    const result = await deletePublisherGroup(db, 5, 1, 99)

    expect(result).toEqual(fakeDeleted)
    expect(mockDelete).toHaveBeenCalledWith({
      where: {
        id_congregationId: { id: 5, congregationId: 1 },
      },
    })
  })
})
