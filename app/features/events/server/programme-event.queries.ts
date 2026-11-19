import type { TransactionClient } from '~/shared/infra/db.server'

/**
 * An event of the congregation by its id; null for an unknown id or another congregation's. Every event is a programme
 * now that absences have a table of their own.
 */
export function findProgrammeEvent(db: TransactionClient, eventId: number, congregationId: number) {
  return db.event.findFirst({ where: { id: eventId, congregationId } })
}
