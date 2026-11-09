import type { ConflictAction } from './reassign'

/** An assignment falling during an absence, as the absences page shows it. */
export interface ProgrammeAbsenceConflict {
  /** `part-12`, `service-7`. */
  key: string
  name: string
  eventDate: Date | string
  /** The event's page, opened on the slot for « Réattribuer »; null when the reader cannot open the programmes. */
  href: string | null
  action: ConflictAction | null
}

/** Someone's absence on the absences page. */
export interface ProgrammeAbsence {
  id: number
  startDate: Date | string
  endDate: Date | string
  declaredAt: Date | string
  name: string
  /** The person's record, for readers of the publishers who may open it. */
  recordHref: string | null
  conflicts: ProgrammeAbsenceConflict[]
}
