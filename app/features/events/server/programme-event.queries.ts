import type { TransactionClient } from '~/shared/infra/db.server'

/** An event of the congregation by its id; null for another congregation's. Every event is a programme. */
export function findProgrammeEvent(db: TransactionClient, eventId: number, congregationId: number) {
  return db.event.findFirst({ where: { id: eventId, congregationId } })
}
