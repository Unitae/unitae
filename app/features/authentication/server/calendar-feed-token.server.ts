import crypto from 'node:crypto'
import type { CalendarFeedToken, UserAccount } from '~/database/generated/client'
import { unscopedDb as db } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'

export async function createCalendarFeedToken(userId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString('base64url')

  await db.calendarFeedToken.deleteMany({ where: { userId } })
  await db.calendarFeedToken.create({ data: { token, userId } })

  return token
}

export async function revokeCalendarFeedToken(userId: number): Promise<void> {
  await db.calendarFeedToken.deleteMany({ where: { userId } })
}

export function getCalendarFeedToken(userId: number): Promise<CalendarFeedToken | null> {
  return db.calendarFeedToken.findUnique({ where: { userId } })
}

type UserWithMember = UserAccount & { member: { firstname: string | null; lastname: string | null } | null }

export async function findUserByCalendarFeedToken(
  token: string,
): Promise<{ tokenId: number; user: UserWithMember } | null> {
  const record = await db.calendarFeedToken.findUnique({
    where: { token },
    include: { user: { include: { member: { select: { firstname: true, lastname: true } } } } },
  })

  return record ? { tokenId: record.id, user: record.user } : null
}

export function touchCalendarFeedToken(tokenId: number): void {
  db.calendarFeedToken.update({ where: { id: tokenId }, data: { lastUsedAt: new Date() } }).catch(error => {
    logger.warn(`Failed to update calendar feed token lastUsedAt for id=${tokenId}: ${String(error)}`)
  })
}
