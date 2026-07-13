import type { TransactionClient } from '~/shared/infra/db.server'
import * as attributionAggregate from './attribution.aggregate'

/**
 * Update an existing attribution. Thin delegator; the invariants
 * (`_assertNoActiveOverlap` when dates change, audit) live in
 * `attribution.aggregate.update`.
 */
export type UpdateAttributionParams = attributionAggregate.UpdateAttributionParams

export function updateAttribution(
  db: TransactionClient,
  id: number,
  congregationId: number,
  actorId: number,
  params: UpdateAttributionParams,
) {
  return attributionAggregate.update(db, id, congregationId, actorId, params)
}
