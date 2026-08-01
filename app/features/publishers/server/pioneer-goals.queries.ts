import type { TransactionClient } from '~/shared/infra/db.server'
import type { PublisherType } from '~/shared/types/publisher-type'

import { resolveDefaultGoal } from '../model/pioneer-goals.constants'

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
