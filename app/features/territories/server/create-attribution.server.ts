import type { TransactionClient } from '~/shared/infra/db.server'
import * as attributionAggregate from './attribution.aggregate'

/**
 * Assign a territory to a publisher. Thin delegator kept for verb-noun
 * discoverability; the invariant (`_assertNoActiveOverlap`, lateDate resolution,
 * audit) lives in `attribution.aggregate.assign`.
 */
export type CreateAttributionParams = attributionAggregate.CreateAttributionParams

export function createAttribution(db: TransactionClient, params: CreateAttributionParams) {
  return attributionAggregate.assign(db, params)
}
