import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = {
  publisherGroup: { update: vi.fn() },
}

const { updateGroup } = await import('./update-group.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('updateGroup', () => {
  it('updates group with responsible and deputy', async () => {
    const fake = { id: 1, name: 'Groupe A' }
    mockDb.publisherGroup.update.mockResolvedValue(fake as never)

    const result = await updateGroup(mockDb as any, 1, 10, {
      name: 'Groupe A',
      address: '123 rue Exemple',
      responsibleId: 5,
      deputyId: 8,
    })

    expect(result).toEqual(fake)
    const call = mockDb.publisherGroup.update.mock.calls[0][0]
    expect(call.data.responsibleId).toBe(5)
    expect(call.data.deputyId).toBe(8)
    expect(call.data.members.connect).toEqual([{ id: 5 }, { id: 8 }])
  })

  it('updates group with responsible only (no deputy)', async () => {
    mockDb.publisherGroup.update.mockResolvedValue({} as never)

    await updateGroup(mockDb as any, 2, 10, {
      name: 'Groupe B',
      address: '456 avenue Test',
      responsibleId: 3,
      deputyId: null,
    })

    const call = mockDb.publisherGroup.update.mock.calls[0][0]
    expect(call.data.responsibleId).toBe(3)
    expect(call.data.deputyId).toBeNull()
    expect(call.data.members.connect).toEqual([{ id: 3 }])
  })
})
