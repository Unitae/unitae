import type { TransactionClient } from '~/shared/infra/db.server'
import { combineLocalDateTime } from '~/shared/utils/event-time'
import { zonedNow } from '~/shared/utils/zoned-now'

/** The publisher roll, and who joined or left it this month. */
export interface RollChanges {
  total: number
  arrived: number
  left: number
}

const isoDay = (year: number, month: number) => `${year}-${String(month + 1).padStart(2, '0')}-01`

/**
 * The current month on the congregation calendar, two ways: arrival dates are date-only and
 * stored at UTC midnight, so they compare by calendar day; departures are instants, so they
 * compare against the month's first moment on the congregation clock.
 */
export function rollMonthBounds(timezone: string, now: Date = new Date()) {
  const today = zonedNow(timezone, now)
  const year = today.getFullYear()
  const month = today.getMonth()
  const next = month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 }
  return {
    days: { gte: new Date(Date.UTC(year, month, 1)), lt: new Date(Date.UTC(next.year, next.month, 1)) },
    instants: {
      gte: combineLocalDateTime(isoDay(year, month), '00:00', timezone),
      lt: combineLocalDateTime(isoDay(next.year, next.month), '00:00', timezone),
    },
  }
}

export async function getRollChanges(
  db: TransactionClient,
  congregationId: number,
  timezone: string,
  now: Date = new Date(),
): Promise<RollChanges> {
  const bounds = rollMonthBounds(timezone, now)
  const [total, arrived, left] = await Promise.all([
    db.member.count({ where: { congregationId, isPublisher: true, leftAt: null } }),
    db.member.count({ where: { congregationId, isPublisher: true, arrivedAt: bounds.days } }),
    db.member.count({ where: { congregationId, leftAt: bounds.instants } }),
  ])
  return { total, arrived, left }
}
