import type { Prisma } from '~/database/generated/client'
import { startOfNextDay } from '~/shared/utils/date.server'

// Attribution overlaps [startDate, endDate] iff its startDate is strictly
// before the start of the day AFTER endDate, AND (its endDate is null OR
// >= startDate). The `lt: startOfNextDay(endDate)` form makes the upper
// bound inclusive of the picked day regardless of TZ — `lte: endDate`
// would silently exclude attributions whose stored timestamp drifts past
// the local midnight of the picked day.
export function buildAttributionDateOverlapWhere(startDate: Date, endDate: Date): Prisma.AttributionWhereInput {
  return {
    startDate: { lt: startOfNextDay(endDate) },
    OR: [{ endDate: null }, { endDate: { gte: startDate } }],
  }
}
