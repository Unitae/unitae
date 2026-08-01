import type { TransactionClient } from '~/shared/infra/db.server'
import type { PublisherType } from '~/shared/types/publisher-type'

import { PIONEER_TYPES, resolveDefaultGoal } from '../model/pioneer-goals.constants'

// Resolve the monthly hour goal for a (service year, type): a congregation override
// in PioneerGoal wins, otherwise the built-in default rate. `findFirst` — the unique
// is compound ([serviceYear, type, congregationId]) and RLS injects congregationId.
export async function resolvePioneerGoal(
  db: TransactionClient,
  serviceYear: number,
  type: PublisherType,
): Promise<number> {
  const override = await db.pioneerGoal.findFirst({ where: { serviceYear, type } })
  return override?.monthlyHours ?? resolveDefaultGoal(type)
}

export interface PioneerGoalRow {
  type: PublisherType
  defaultRate: number
  override: number | null
  effectiveRate: number
}

// The per-type goal picture for a service year: built-in default, the congregation's
// override (if any), and the effective rate — used to pre-fill the goal-editing form.
export async function listPioneerGoalsForYear(db: TransactionClient, serviceYear: number): Promise<PioneerGoalRow[]> {
  const rows = await db.pioneerGoal.findMany({ where: { serviceYear } })
  const overrides = new Map(rows.map(r => [r.type, r.monthlyHours]))

  return PIONEER_TYPES.map(type => {
    const defaultRate = resolveDefaultGoal(type)
    const override = overrides.get(type) ?? null
    return { type, defaultRate, override, effectiveRate: override ?? defaultRate }
  })
}
