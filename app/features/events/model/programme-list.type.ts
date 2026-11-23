/** One programme as the programmes list shows it: what it is, what is left to fill, and what the reader may do. */
export interface ProgrammeRowData {
  id: number
  name: string
  startDate: Date | string
  endDate: Date | string
  status: string
  kind: { name: string; color: string } | null
  parts: { total: number; filled: number }
  services: { total: number; filled: number }
  /** A meeting with no programme yet: « Pas encore de programme » rather than a draft, and never published. */
  awaitingProgramme: boolean
  /** Assignments falling in an absence that the reader may reassign; 0 once the programme is under way. */
  review: number
  /** Change it (date, hours, kind) and open its editor. */
  canEdit: boolean
  /** Delete it: « Gérer », or its kind's responsible when it holds schedules and every one is theirs (D50). */
  canDelete: boolean
  /** Publish it, or put it back to draft. */
  canPublish: boolean
}
