import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PublisherType } from '~/shared/types/publisher-type'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: { pioneerGoal: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() } },
}))
vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { PioneerGoalUpdated: 'pioneer_goal.updated', PioneerGoalReset: 'pioneer_goal.reset' },
  auditInTransaction: vi.fn(),
}))

const { savePioneerGoals } = await import('./save-pioneer-goals.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const { auditInTransaction } = await import('~/shared/domain/audit.server')

const base = { serviceYear: 2026, congregationId: 3, actorId: 9 }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.pioneerGoal.upsert).mockResolvedValue({ id: 70 } as never)
  // The congregation has set the auxiliary goal to 15 h; the other types follow the defaults (50, 100, 100).
  vi.mocked(db.pioneerGoal.findMany).mockResolvedValue([
    { id: 41, type: PublisherType.PionnierAuxiliaires, monthlyHours: 15 },
  ] as never)
})

describe('savePioneerGoals', () => {
  it('writes nothing for the types whose hours did not change', async () => {
    const result = await savePioneerGoals(db, {
      ...base,
      hours: { [PublisherType.PionnierPermanant]: 50, [PublisherType.PionnierAuxiliaires]: 15 },
    })

    expect(result).toEqual({ saved: 0, reset: 0 })
    expect(db.pioneerGoal.upsert).not.toHaveBeenCalled()
    expect(db.pioneerGoal.deleteMany).not.toHaveBeenCalled()
    expect(auditInTransaction).not.toHaveBeenCalled()
  })

  it('keeps a goal of its own for a type set to other hours than the default', async () => {
    const result = await savePioneerGoals(db, { ...base, hours: { [PublisherType.PionnierPermanant]: 55 } })

    expect(result).toEqual({ saved: 1, reset: 0 })
    expect(db.pioneerGoal.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { serviceYear: 2026, type: PublisherType.PionnierPermanant, monthlyHours: 55, congregationId: 3 },
      }),
    )
  })

  it('lets a type set back to its default follow the default again, and says so in the journal', async () => {
    const result = await savePioneerGoals(db, { ...base, hours: { [PublisherType.PionnierAuxiliaires]: 30 } })

    expect(result).toEqual({ saved: 0, reset: 1 })
    expect(db.pioneerGoal.upsert).not.toHaveBeenCalled()
    expect(db.pioneerGoal.deleteMany).toHaveBeenCalledWith({
      where: { serviceYear: 2026, type: PublisherType.PionnierAuxiliaires, congregationId: 3 },
    })
    expect(auditInTransaction).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        action: 'pioneer_goal.reset',
        entityType: 'PioneerGoal',
        entityId: 41,
        metadata: { serviceYear: 2026, type: PublisherType.PionnierAuxiliaires, monthlyHours: 30 },
      }),
    )
  })

  it('reads only the service year being saved', async () => {
    await savePioneerGoals(db, { ...base, hours: {} })

    expect(db.pioneerGoal.findMany).toHaveBeenCalledWith({ where: { serviceYear: 2026, congregationId: 3 } })
  })
})
