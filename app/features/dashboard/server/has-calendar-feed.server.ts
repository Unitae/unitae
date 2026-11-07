import type { TransactionClient } from '~/shared/infra/db.server'

/** Whether the account already subscribes to its assignments in a calendar app. Revoking deletes the link. */
export async function hasCalendarFeed(db: TransactionClient, accountId: number) {
  const token = await db.calendarFeedToken.findUnique({ where: { userId: accountId }, select: { id: true } })
  return token != null
}
