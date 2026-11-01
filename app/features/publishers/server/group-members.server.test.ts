import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./member.aggregate', () => ({ setGroup: vi.fn() }))

const { addGroupMember, removeGroupMember } = await import('./group-members.server')
const { setGroup } = await import('./member.aggregate')
const { NotFoundError } = await import('~/shared/errors/app-error.server')

const mockDb = {
  member: { findFirst: vi.fn() },
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
