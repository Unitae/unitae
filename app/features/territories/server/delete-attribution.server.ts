import type { TransactionClient } from '~/shared/infra/db.server'
import * as attributionAggregate from './attribution.aggregate'

/**
 * Archive (hard-delete) an attribution. Thin delegator; the mutation lives
 * in `attribution.aggregate.archive`.
 */
export function deleteAttribution(db: TransactionClient, id: number, congregationId: number, actorId: number) {
  return attributionAggregate.archive(db, id, congregationId, actorId)
}
