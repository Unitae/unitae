import type { TransactionClient } from '~/shared/infra/db.server'
import { combineLocalDateTime } from '~/shared/utils/event-time'
import { zonedNow } from '~/shared/utils/zoned-now'

/** The publisher roll, and who joined or left it since the service year began. */
export interface RollChanges {
  total: number
  arrived: number
  left: number
}

/** September, 0-based: the service year runs from September to August. */
const SERVICE_YEAR_FIRST_MONTH = 8

/**
 * The service year so far on the congregation calendar, two ways: arrival dates are date-only and
 * stored at UTC midnight, so they compare by calendar day; departures are instants, so they
 * compare against the first moment of 1 September on the congregation clock.
 */
export function rollServiceYearBounds(timezone: string, now: Date = new Date()) {
  const today = zonedNow(timezone, now)
  const year = today.getMonth() >= SERVICE_YEAR_FIRST_MONTH ? today.getFullYear() : today.getFullYear() - 1
  return {
    days: {
      gte: new Date(Date.UTC(year, SERVICE_YEAR_FIRST_MONTH, 1)),
      lt: new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + 1)),
    },
    instants: { gte: combineLocalDateTime(`${year}-09-01`, '00:00', timezone), lte: now },
  }
}

export async function getRollChanges(
  db: TransactionClient,
  congregationId: number,
  timezone: string,
  now: Date = new Date(),
): Promise<RollChanges> {
  const bounds = rollServiceYearBounds(timezone, now)
  const [total, arrived, left] = await Promise.all([
    db.member.count({ where: { congregationId, isPublisher: true, leftAt: null } }),
    db.member.count({ where: { congregationId, isPublisher: true, arrivedAt: bounds.days } }),
    db.member.count({ where: { congregationId, isPublisher: true, leftAt: bounds.instants } }),
  ])
  return { total, arrived, left }
}
