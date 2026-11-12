import { EventTemplateKey } from '~/features/events/model/event-template.type'
import type { TransactionClient } from '~/shared/infra/db.server'

// Absences are events too, under the « Absence » template, and each person manages theirs in « Mes absences ». Every
// programme lookup leaves them out, so an absence's id typed into a programme address opens nothing: it cannot be
// published, turned into a draft, moved or edited there.

/** The where clause of a programme: any event but an absence. An event without a template is a programme. */
export const PROGRAMME_EVENT = { NOT: { template: { key: EventTemplateKey.DayOff } } }

/** A programme of the congregation by its id; null for an absence or another congregation's event. */
export function findProgrammeEvent(db: TransactionClient, eventId: number, congregationId: number) {
  return db.event.findFirst({ where: { id: eventId, congregationId, ...PROGRAMME_EVENT } })
}
