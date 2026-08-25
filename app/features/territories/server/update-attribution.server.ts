import type { TransactionClient } from '~/shared/infra/db.server'
import * as attributionAggregate from './attribution.aggregate'
import { assertPublisherAllowedForAttribution } from './attribution-eligibility.policy'

/**
 * Update an existing attribution. Thin delegator; the invariants
 * (`_assertNoActiveOverlap` when dates change, audit) live in
 * `attribution.aggregate.update`.
 *
 * Role gating sits here for the same reason as in `createAttribution`: the
 * check belongs to the human-initiated path, not to the aggregate.
 */
export type UpdateAttributionParams = attributionAggregate.UpdateAttributionParams

export async function updateAttribution(
  db: TransactionClient,
  id: number,
  congregationId: number,
  actorId: number,
  params: UpdateAttributionParams,
) {
  await assertPublisherAllowedForAttribution(db, id, params.publisherId, congregationId)

  return attributionAggregate.update(db, id, congregationId, actorId, params)
}
