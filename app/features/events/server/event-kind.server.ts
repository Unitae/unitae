import type { TransactionClient } from '~/shared/infra/db.server'

export async function getAllEventType(db: TransactionClient, congregationId: number) {
  return await db.eventKind.findMany({ where: { congregationId } })
}
