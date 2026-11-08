import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./member.aggregate', () => ({ setGroup: vi.fn() }))

const { addGroupMember, moveMembersToGroup, removeGroupMember } = await import('./group-members.server')
const { setGroup } = await import('./member.aggregate')
const { ConflictError, NotFoundError } = await import('~/shared/errors/app-error.server')

const mockDb = {
  member: { findFirst: vi.fn(), findMany: vi.fn() },
  publisherGroup: { findFirst: vi.fn() },
}
const db = mockDb as never

beforeEach(() => {
  vi.resetAllMocks()
})

describe('addGroupMember', () => {
  it('puts an active publisher in the group and names them for the confirmation', async () => {
    mockDb.publisherGroup.findFirst.mockResolvedValue({ id: 4 })
    mockDb.member.findFirst.mockResolvedValue({ id: 9, firstname: 'Ana', lastname: 'Lima' })

    await expect(addGroupMember(db, 4, 7, 9, 99)).resolves.toEqual({ firstname: 'Ana', lastname: 'Lima' })

    expect(setGroup).toHaveBeenCalledWith(db, 9, 7, 4, 99)
  })

  it('looks the publisher up among the active publishers of the congregation', async () => {
    mockDb.publisherGroup.findFirst.mockResolvedValue({ id: 4 })
    mockDb.member.findFirst.mockResolvedValue({ id: 9, firstname: 'Ana', lastname: 'Lima' })

    await addGroupMember(db, 4, 7, 9, 99)

    expect(mockDb.member.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 9, congregationId: 7, isPublisher: true, leftAt: null, anonymizedAt: null },
      }),
    )
  })

  it('refuses a member who is not an active publisher', async () => {
    mockDb.publisherGroup.findFirst.mockResolvedValue({ id: 4 })
    mockDb.member.findFirst.mockResolvedValue(null)

    await expect(addGroupMember(db, 4, 7, 9, 99)).rejects.toBeInstanceOf(NotFoundError)
    expect(setGroup).not.toHaveBeenCalled()
  })

  it('refuses a group outside the congregation', async () => {
    mockDb.publisherGroup.findFirst.mockResolvedValue(null)
    mockDb.member.findFirst.mockResolvedValue({ id: 9, firstname: 'Ana', lastname: 'Lima' })

    await expect(addGroupMember(db, 4, 7, 9, 99)).rejects.toBeInstanceOf(NotFoundError)
    expect(setGroup).not.toHaveBeenCalled()
  })
})

describe('removeGroupMember', () => {
  it('takes a member of the group out of every group', async () => {
    mockDb.member.findFirst.mockResolvedValue({ id: 9, firstname: 'Ana', lastname: 'Lima' })

    await expect(removeGroupMember(db, 4, 7, 9, 99)).resolves.toEqual({ firstname: 'Ana', lastname: 'Lima' })

    expect(mockDb.member.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 9, congregationId: 7, publisherGroupId: 4 } }),
    )
    expect(setGroup).toHaveBeenCalledWith(db, 9, 7, null, 99)
  })

  it('refuses a member who is not in the group', async () => {
    mockDb.member.findFirst.mockResolvedValue(null)

    await expect(removeGroupMember(db, 4, 7, 9, 99)).rejects.toBeInstanceOf(NotFoundError)
    expect(setGroup).not.toHaveBeenCalled()
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
