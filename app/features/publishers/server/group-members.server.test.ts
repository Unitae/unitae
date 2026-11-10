import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./member.aggregate', () => ({ setGroup: vi.fn() }))

const { changeGroupMembers, moveMembersToGroup } = await import('./group-members.server')
const { setGroup } = await import('./member.aggregate')
const { ConflictError, NotFoundError } = await import('~/shared/errors/app-error.server')

const mockDb = {
  member: { findMany: vi.fn() },
  publisherGroup: { findFirst: vi.fn() },
}
const db = mockDb as never

beforeEach(() => {
  vi.resetAllMocks()
})

describe('changeGroupMembers', () => {
  const ana = { id: 9 }
  const paul = { id: 10 }

  it('puts the added publishers in the group and takes the removed ones out of every group', async () => {
    mockDb.publisherGroup.findFirst.mockResolvedValue({ id: 4 })
    mockDb.member.findMany.mockResolvedValueOnce([ana]).mockResolvedValueOnce([paul])

    await changeGroupMembers(db, 4, 7, { add: [9], remove: [10] }, 99)

    expect(vi.mocked(setGroup).mock.calls).toEqual([
      [db, 9, 7, 4, 99],
      [db, 10, 7, null, 99],
    ])
  })

  // Added: active publishers of the congregation; removed: those still in this group, so a move made meanwhile from
  // the publishers list is not undone.
  it('adds only active publishers, and removes only those still in the group', async () => {
    mockDb.publisherGroup.findFirst.mockResolvedValue({ id: 4 })
    mockDb.member.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    await changeGroupMembers(db, 4, 7, { add: [9], remove: [10] }, 99)

    expect(mockDb.member.findMany.mock.calls.map(([query]) => query.where)).toEqual([
      { id: { in: [9] }, congregationId: 7, isPublisher: true, leftAt: null, anonymizedAt: null },
      { id: { in: [10] }, congregationId: 7, publisherGroupId: 4 },
    ])
    expect(setGroup).not.toHaveBeenCalled()
  })

  // The save is one transaction: the refusal for a group leader undoes the rest of it.
  it("lets the aggregate's refusal for a group leader through", async () => {
    mockDb.publisherGroup.findFirst.mockResolvedValue({ id: 4 })
    mockDb.member.findMany.mockResolvedValueOnce([ana]).mockResolvedValueOnce([])
    vi.mocked(setGroup).mockRejectedValue(new ConflictError('Ana LIMA dirige le groupe Sud.'))

    await expect(changeGroupMembers(db, 4, 7, { add: [9], remove: [] }, 99)).rejects.toBeInstanceOf(ConflictError)
  })

  it('refuses a group outside the congregation before moving anyone', async () => {
    mockDb.publisherGroup.findFirst.mockResolvedValue(null)

    await expect(changeGroupMembers(db, 4, 7, { add: [9], remove: [] }, 99)).rejects.toBeInstanceOf(NotFoundError)
    expect(setGroup).not.toHaveBeenCalled()
  })

  it('reads nothing when nobody was added or removed', async () => {
    await changeGroupMembers(db, 4, 7, { add: [], remove: [] }, 99)

    expect(mockDb.publisherGroup.findFirst).not.toHaveBeenCalled()
    expect(mockDb.member.findMany).not.toHaveBeenCalled()
  })
})

describe('moveMembersToGroup', () => {
  const people = [
    { id: 9, firstname: 'Ana', lastname: 'Lima' },
    { id: 10, firstname: 'Paul', lastname: 'Bernard' },
    { id: 11, firstname: 'Inès', lastname: 'Fontaine' },
  ]

  it('moves every active publisher it can and reports the leaders of another group it could not', async () => {
    mockDb.publisherGroup.findFirst.mockResolvedValue({ id: 4, name: 'Groupe Nord' })
    mockDb.member.findMany.mockResolvedValue(people)
    vi.mocked(setGroup).mockImplementation((_db, memberId) =>
      memberId === 10 ? Promise.reject(new ConflictError('Paul BERNARD dirige le groupe Sud.')) : Promise.resolve(),
    )

    await expect(moveMembersToGroup(db, 4, 7, [9, 10, 11], 99)).resolves.toEqual({
      group: { name: 'Groupe Nord' },
      moved: 2,
      refused: ['Paul BERNARD dirige le groupe Sud.'],
    })
  })

  it('takes them out of every group when no group is given', async () => {
    mockDb.member.findMany.mockResolvedValue(people.slice(0, 1))

    await expect(moveMembersToGroup(db, null, 7, [9], 99)).resolves.toEqual({ group: null, moved: 1, refused: [] })
  })

  it('refuses a group outside the congregation before moving anyone', async () => {
    mockDb.publisherGroup.findFirst.mockResolvedValue(null)
    mockDb.member.findMany.mockResolvedValue(people)

    await expect(moveMembersToGroup(db, 4, 7, [9], 99)).rejects.toBeInstanceOf(NotFoundError)
  })
})
