import { describe, expect, it, vi } from 'vitest'
import { getPastoralVisitForMember } from './pastoral-visit.queries'

describe('getPastoralVisitForMember', () => {
  it('reads the member in its congregation, with only what the visit page needs', async () => {
    const findFirst = vi.fn().mockResolvedValue(null)

    await getPastoralVisitForMember({ member: { findFirst } } as never, 9, 7)

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 9, congregationId: 7 },
      select: { id: true, firstname: true, lastname: true, publisherGroupId: true, lastPastoralVisitAt: true },
    })
  })
})
