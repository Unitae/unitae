import type { TransactionClient } from '~/shared/libs/db.server'

export async function getAllEventType(db: TransactionClient) {
  return await db.eventKind.findMany()
}
