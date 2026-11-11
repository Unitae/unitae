import { AuditAction, auditInTransaction } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { PublisherType } from '~/shared/types/publisher-type'
import { resolveDefaultGoal } from '../model/pioneer-goals.constants'
import { setPioneerGoal } from './set-pioneer-goal.server'

export interface SavePioneerGoalsParams {
  serviceYear: number
  /** The hours shown for each type, changed or not: only the changed ones are written. */
  hours: Partial<Record<PublisherType, number>>
  congregationId: number
  actorId: number
}

/**
 * Saves a service year's goals as they were edited: a type whose hours did not change is left alone, a type set to
 * other hours than its default keeps a goal of its own, and a type set back to its default loses it, so it follows
 * the default again. Nothing becomes « personnalisé » just by being saved alongside another. One transaction with
 * the caller; each write is audited in it.
 */
export async function savePioneerGoals(db: TransactionClient, params: SavePioneerGoalsParams) {
  const { serviceYear, hours, congregationId, actorId } = params
  const rows = await db.pioneerGoal.findMany({ where: { serviceYear, congregationId } })
  const own = new Map(rows.map(row => [row.type, row]))
  let saved = 0
  let reset = 0

  for (const [type, monthlyHours] of Object.entries(hours) as [PublisherType, number][]) {
    const current = own.get(type)
    const defaultRate = resolveDefaultGoal(type)
    if (monthlyHours === (current?.monthlyHours ?? defaultRate)) continue

    if (monthlyHours === defaultRate && current) {
      await db.pioneerGoal.deleteMany({ where: { serviceYear, type, congregationId } })
      await auditInTransaction(db, {
        action: AuditAction.PioneerGoalReset,
        congregationId,
        actorId,
        entityType: 'PioneerGoal',
        entityId: current.id,
        metadata: { serviceYear, type, monthlyHours },
      })
      reset++
    } else {
      await setPioneerGoal(db, { serviceYear, type, monthlyHours, congregationId, actorId })
      saved++
    }
  }

  return { saved, reset }
}
