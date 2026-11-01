import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = {
  publisherGroup: { update: vi.fn() },
}

vi.mock('./group-leaders.server', () => ({ assertGroupLeaders: vi.fn() }))
vi.mock('./member.aggregate', () => ({ setGroup: vi.fn() }))
vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { PublisherGroupUpdated: 'publisher.group.updated' },
  audit: vi.fn(),
}))

const { updateGroup } = await import('./update-group.server')
const { assertGroupLeaders } = await import('./group-leaders.server')
const { setGroup } = await import('./member.aggregate')
const { audit } = await import('~/shared/domain/audit.server')
const { ValidationError } = await import('~/shared/errors/app-error.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('updateGroup', () => {
  it('updates group with responsible and deputy', async () => {
    const fake = { id: 1, name: 'Groupe A' }
    mockDb.publisherGroup.update.mockResolvedValue(fake as never)

    const result = await updateGroup(mockDb as never, 1, 10, 99, {
      name: 'Groupe A',
      address: '123 rue Exemple',
      responsibleId: 5,
      deputyId: 8,
    })

    expect(result).toEqual(fake)
    const call = mockDb.publisherGroup.update.mock.calls[0][0]
    expect(call.data.responsibleId).toBe(5)
    expect(call.data.deputyId).toBe(8)
  })

  // Choosing someone as overseer or deputy moves them into the group (a settled product rule),
  // through the member aggregate rather than a nested write it cannot see.
  it('puts the overseer and the deputy in the group', async () => {
    mockDb.publisherGroup.update.mockResolvedValue({ id: 1 } as never)

    await updateGroup(mockDb as never, 1, 10, 99, { name: 'A', address: 'x', responsibleId: 5, deputyId: 8 })

    expect(vi.mocked(setGroup).mock.calls).toEqual([
      [mockDb, 5, 10, 1, 99],
      [mockDb, 8, 10, 1, 99],
    ])
    expect(mockDb.publisherGroup.update.mock.calls[0][0].data).not.toHaveProperty('members')
  })

  it('updates group with responsible only (no deputy)', async () => {
    mockDb.publisherGroup.update.mockResolvedValue({} as never)

    await updateGroup(mockDb as never, 2, 10, 99, {
      name: 'Groupe B',
      address: '456 avenue Test',
      responsibleId: 3,
      deputyId: null,
    })

    const call = mockDb.publisherGroup.update.mock.calls[0][0]
    expect(call.data.responsibleId).toBe(3)
    expect(call.data.deputyId).toBeNull()
    expect(vi.mocked(setGroup).mock.calls).toEqual([[mockDb, 3, 10, 2, 99]])
  })

  // Regression: any member id was written, whoever it was — a sister, someone who had left, or a
  // brother leading another group (the last one a 500 through the unique constraint).
  it('checks the leaders for this group before writing anything', async () => {
    vi.mocked(assertGroupLeaders).mockRejectedValue(new ValidationError('deputy', 'not eligible'))

    await expect(
      updateGroup(mockDb as never, 2, 10, 99, { name: 'B', address: 'x', responsibleId: 3, deputyId: 4 }),
    ).rejects.toBeInstanceOf(ValidationError)

    expect(assertGroupLeaders).toHaveBeenCalledWith(mockDb, 10, { responsibleId: 3, deputyId: 4, groupId: 2 })
    expect(mockDb.publisherGroup.update).not.toHaveBeenCalled()
  })

  // Regression: an update left no trace in the audit trail.
  it('records who changed the group', async () => {
    mockDb.publisherGroup.update.mockResolvedValue({ id: 2 } as never)

    await updateGroup(mockDb as never, 2, 10, 99, { name: 'B', address: 'x', responsibleId: 3, deputyId: null })

    expect(audit).toHaveBeenCalledWith({
      action: 'publisher.group.updated',
      congregationId: 10,
      actorId: 99,
      entityType: 'PublisherGroup',
      entityId: 2,
    })
  })
})
