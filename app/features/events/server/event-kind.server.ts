import { db } from '~/shared/libs/db.server'

export async function getAllEventType() {
  return await db.eventKind.findMany()
}
