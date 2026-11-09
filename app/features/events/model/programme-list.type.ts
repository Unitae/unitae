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
  /** Assignments falling in an absence that the reader may reassign; 0 once the programme is under way. */
  review: number
  /** Edit and delete it. */
  canEdit: boolean
  /** Publish it, or put it back to draft. */
  canPublish: boolean
}
