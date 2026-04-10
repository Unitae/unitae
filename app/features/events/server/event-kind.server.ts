import type { ScopedDb } from '~/shared/libs/db.server'

export async function getAllEventType(db: ScopedDb) {
  return await db.eventKind.findMany()
}
