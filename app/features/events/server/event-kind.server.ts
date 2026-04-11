import type { TransactionClient } from '~/shared/libs/db.server'

export async function getAllEventType(db: TransactionClient, congregationId: number) {
  return await db.eventKind.findMany({ where: { congregationId } })
}
