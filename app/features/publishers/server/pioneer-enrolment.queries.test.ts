import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PublisherType } from '~/shared/types/publisher-type'

vi.mock('~/shared/infra/db.server', () => ({ unscopedDb: { pioneerEnrolment: { findMany: vi.fn() } } }))

const { listOngoingEnrolleesOfType } = await import('./pioneer-enrolment.queries')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => vi.resetAllMocks())

describe('listOngoingEnrolleesOfType', () => {
  it('names the members whose stint of that type has no end, by last name', async () => {
    vi.mocked(db.pioneerEnrolment.findMany).mockResolvedValue([
      { member: { id: 4, firstname: 'Léa', lastname: 'Martin' } },
      { member: { id: 2, firstname: 'Paul', lastname: 'André' } },
    ] as never)

    const people = await listOngoingEnrolleesOfType(db, 3, PublisherType.PionnierAuxiliaires)

    expect(people).toEqual([
      { id: 2, firstname: 'Paul', lastname: 'André' },
      { id: 4, firstname: 'Léa', lastname: 'Martin' },
    ])
    expect(db.pioneerEnrolment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { congregationId: 3, type: PublisherType.PionnierAuxiliaires, endMonth: null, endYear: null },
      }),
    )
  })
})
