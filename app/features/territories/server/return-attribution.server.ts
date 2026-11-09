import { ConflictError, NotFoundError, ValidationError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { formatLocalDate, parseLocalDate } from '~/shared/utils/date.server'

import * as attributionAggregate from './attribution.aggregate'

export interface ReturnAttributionInput {
  id: number
  /** The day the territory came back, `YYYY-MM-DD`. */
  endDay: string
  /** Today, `YYYY-MM-DD`, in the same convention as the days saved. */
  today: string
  congregationId: number
  actorId: number
}

/**
 * Records the day a territory came back (« Rentrer »). The day is read like the day it went out (`parseLocalDate`),
 * never before it and never after today; a territory already rentré cannot come back twice.
 */
export async function returnAttribution(db: TransactionClient, input: ReturnAttributionInput) {
  const attribution = await db.attribution.findFirst({
    where: { id: input.id, congregationId: input.congregationId },
    select: { id: true, startDate: true, endDate: true },
  })
  if (attribution == null) throw new NotFoundError('Attribution')
  if (attribution.endDate != null) throw new ConflictError('attribution_already_returned')
  if (input.endDay < formatLocalDate(attribution.startDate))
    throw new ValidationError('end-date', 'return_before_start')
  if (input.endDay > input.today) throw new ValidationError('end-date', 'return_in_future')

  return attributionAggregate.markReturned(
    db,
    input.id,
    parseLocalDate(input.endDay),
    input.congregationId,
    input.actorId,
  )
}
