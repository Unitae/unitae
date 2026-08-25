import type { TransactionClient } from '~/shared/infra/db.server'
import * as attributionAggregate from './attribution.aggregate'
import { assertPublisherAllowedForKind } from './attribution-eligibility.policy'

/**
 * Assign a territory to a publisher. Thin delegator kept for verb-noun
 * discoverability; the invariant (`_assertNoActiveOverlap`, lateDate resolution,
 * audit) lives in `attribution.aggregate.assign`.
 *
 * Role gating sits here rather than in the aggregate on purpose: this is the
 * human-initiated path, so the campaign sweep — which calls the aggregate
 * directly — keeps carrying existing pairings across a role change.
 */
export type CreateAttributionParams = attributionAggregate.CreateAttributionParams

export async function createAttribution(db: TransactionClient, params: CreateAttributionParams) {
  const territory = await db.territory.findFirst({
    where: { id: params.territoryId, congregationId: params.congregationId },
    select: { type: true },
  })
  if (territory != null) {
    await assertPublisherAllowedForKind(db, territory.type, params.publisherId, params.congregationId)
  }

  return attributionAggregate.assign(db, params)
}
