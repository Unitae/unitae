import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockMemberUpdate = vi.fn()
const mockContactDeleteMany = vi.fn()
const mockContactCreateMany = vi.fn()
const mockAudit = vi.fn()

vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { EmergencyInfoUpdated: 'emergency_info.updated' },
  audit: mockAudit,
}))

const mockDb = {
  member: { update: mockMemberUpdate },
  emergencyContact: { deleteMany: mockContactDeleteMany, createMany: mockContactCreateMany },
}

const { updateEmergencyInfo, purgeEmergencyContacts } = await import('./emergency-info.aggregate')

const baseParams = {
  dpaCardUpToDate: true,
  survivalBackpackReady: false,
  contacts: [
    { name: 'Marie Dupont', relationship: 'conjoint', phone: '0612345678' },
    { name: 'Paul Martin', relationship: 'ami', phone: '' },
  ],
}

beforeEach(() => {
  vi.resetAllMocks()
  mockMemberUpdate.mockResolvedValue({ id: 1 } as never)
})

describe('updateEmergencyInfo', () => {
  it('updates the two Member flags and returns the member', async () => {
    const updated = { id: 1, dpaCardUpToDate: true, survivalBackpackReady: false }
    mockMemberUpdate.mockResolvedValue(updated as never)

    const result = await updateEmergencyInfo(mockDb as never, 1, 10, 99, baseParams)

    expect(result).toEqual(updated)
    expect(mockMemberUpdate).toHaveBeenCalledWith({
      where: { id_congregationId: { id: 1, congregationId: 10 } },
      data: { dpaCardUpToDate: true, survivalBackpackReady: false },
    })
  })

  it('replaces the contact set — delete all for the member, then recreate', async () => {
    await updateEmergencyInfo(mockDb as never, 1, 10, 99, baseParams)

    expect(mockContactDeleteMany).toHaveBeenCalledWith({ where: { memberId: 1, congregationId: 10 } })
    expect(mockContactCreateMany).toHaveBeenCalledWith({
      data: [
        { memberId: 1, congregationId: 10, name: 'Marie Dupont', relationship: 'conjoint', phone: '0612345678' },
        { memberId: 1, congregationId: 10, name: 'Paul Martin', relationship: 'ami', phone: '' },
      ],
    })
  })

  it('clears the contacts when the list is empty (delete, no create)', async () => {
    await updateEmergencyInfo(mockDb as never, 1, 10, 99, { ...baseParams, contacts: [] })

    expect(mockContactDeleteMany).toHaveBeenCalledWith({ where: { memberId: 1, congregationId: 10 } })
    expect(mockContactCreateMany).not.toHaveBeenCalled()
  })

  it('audits the update against the Member', async () => {
    await updateEmergencyInfo(mockDb as never, 1, 10, 99, baseParams)

    expect(mockAudit).toHaveBeenCalledWith({
      action: 'emergency_info.updated',
      congregationId: 10,
      actorId: 99,
      entityType: 'Member',
      entityId: 1,
    })
  })
})

describe('purgeEmergencyContacts', () => {
  it('deletes every contact for the member', async () => {
    await purgeEmergencyContacts(mockDb as never, 1, 10)

    expect(mockContactDeleteMany).toHaveBeenCalledWith({ where: { memberId: 1, congregationId: 10 } })
  })
})
