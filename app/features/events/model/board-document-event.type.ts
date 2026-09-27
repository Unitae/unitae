// What the printable programme sheet (EventBoardDocument) reads from an event — nothing more, so
// both the programmes export and the display board can feed it from their own queries.

interface MemberName {
  firstname: string | null
  lastname: string | null
  // Required: it is what keeps an anonymized member's placeholder name off the sheet, so a query
  // that forgets to select it must fail to compile rather than print that name.
  anonymizedAt: Date | null
}

export interface BoardDocumentPart {
  id: number
  name: string
  section: string
  track: string
  order: number
  topic: string
  durationMin: number | null
  assignee: MemberName | null
  assistant: MemberName | null
  externalSpeaker: { name: string } | null
}

export interface BoardDocumentEvent {
  name: string
  startDate: Date
  templateId: number | null
  template?: { name: string } | null
  eventParts: BoardDocumentPart[]
  // Absent when the query left services out; the sheet then prints none. The assignee is
  // optional for the same reason — a query that includes services conditionally types it so —
  // and a missing one prints as unassigned, never as an error.
  eventServiceParts?: { name: string; assignee?: MemberName | null }[]
}

export interface BoardDocumentTemplateOptions {
  parts: boolean
  services: boolean
}
