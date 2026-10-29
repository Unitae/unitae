// What the printable programme reads from an event — nothing more, so the board can feed it from
// its own query.

export interface ProgrammeSheetMember {
  firstname: string | null
  lastname: string | null
  // Required: it is what keeps an anonymized member's placeholder name off the sheet, so a query
  // that forgets to select it must fail to compile rather than print that name.
  anonymizedAt: Date | null
}

export interface ProgrammeSheetPart {
  id: number
  name: string
  section: string
  track: string
  order: number
  topic: string
  durationMin: number | null
  assignee: ProgrammeSheetMember | null
  assistant: ProgrammeSheetMember | null
  externalSpeaker: { name: string } | null
}

export interface ProgrammeSheetEvent {
  name: string
  startDate: Date
  templateId: number | null
  template?: { name: string } | null
  eventParts: ProgrammeSheetPart[]
  // Absent when the query left services out; the sheet then prints none. The assignee is
  // optional for the same reason — a query that includes services conditionally types it so —
  // and a missing one prints as unassigned, never as an error.
  eventServiceParts?: { name: string; assignee?: ProgrammeSheetMember | null }[]
}

export interface ProgrammeSheetTemplateOptions {
  parts: boolean
  services: boolean
}
