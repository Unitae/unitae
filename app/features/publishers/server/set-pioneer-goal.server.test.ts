import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PublisherType } from '~/shared/types/publisher-type'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: { pioneerGoal: { upsert: vi.fn() } },
}))
vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { PioneerGoalUpdated: 'pioneer_goal.updated' },
  auditInTransaction: vi.fn(),
}))

const { setPioneerGoal } = await import('./set-pioneer-goal.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const { auditInTransaction } = await import('~/shared/domain/audit.server')

beforeEach(() => vi.resetAllMocks())

describe('setPioneerGoal', () => {
  it('upserts the goal on the compound key and returns the row', async () => {
    vi.mocked(db.pioneerGoal.upsert).mockResolvedValue({ id: 7, monthlyHours: 55 } as never)

    const result = await setPioneerGoal(db, {
      serviceYear: 2026,
      type: PublisherType.PionnierPermanant,
      monthlyHours: 55,
      congregationId: 3,
      actorId: 9,
    })

    expect(result).toEqual({ id: 7, monthlyHours: 55 })
    expect(db.pioneerGoal.upsert).toHaveBeenCalledWith({
      where: {
        serviceYear_type_congregationId: {
          serviceYear: 2026,
          type: PublisherType.PionnierPermanant,
          congregationId: 3,
        },
      },
      create: { serviceYear: 2026, type: PublisherType.PionnierPermanant, monthlyHours: 55, congregationId: 3 },
      update: { monthlyHours: 55 },
    })
  })

  it('audits the change inside the caller transaction (so a rollback leaves no phantom row)', async () => {
    vi.mocked(db.pioneerGoal.upsert).mockResolvedValue({ id: 7 } as never)

    await setPioneerGoal(db, {
      serviceYear: 2026,
      type: PublisherType.PionnierAuxiliaires,
      monthlyHours: 30,
      congregationId: 3,
      actorId: 9,
    })

    expect(auditInTransaction).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        action: 'pioneer_goal.updated',
        congregationId: 3,
        actorId: 9,
        entityId: 7,
        metadata: { serviceYear: 2026, type: PublisherType.PionnierAuxiliaires, monthlyHours: 30 },
      }),
    )
  })
})
