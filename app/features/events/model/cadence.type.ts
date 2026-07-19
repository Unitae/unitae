// One entry per instance of the recurring event in the CadenceStrip. Client
// and server files share this shape; keeping it here avoids drift between
// the loader payload and the strip / warnings components.
export type CadenceEntry = {
  date: string
  assigned: boolean
  // Formatted display name of whoever was on the slot for this instance
  // (assignee for part-'assignee' + service cadences, assistant for
  // part-'assistant'). Null when the slot was unassigned or the historical
  // event carried no matching part / service row.
  personName: string | null
}

// The two role slots on a part assignment. Speaker (assignee) and reader
// (assistant) are distinct rotation buckets — a person who was the speaker
// one week shouldn't light up the reader cadence the next week.
export type PartSlot = 'assignee' | 'assistant'
