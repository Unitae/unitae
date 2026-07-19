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
  // The instance's Event.status. Meaningful on future entries — draft
  // future assignments are soft commitments that the picker might still undo,
  // so the strip renders them dashed and consecutive-warning gates on them.
  // On past entries the field is still transmitted but nothing renders it
  // (past events already happened, their draft/released state is history).
  status: 'draft' | 'released'
}

// The two role slots on a part assignment. Speaker (assignee) and reader
// (assistant) are distinct rotation buckets — a person who was the speaker
// one week shouldn't light up the reader cadence the next week.
export type PartSlot = 'assignee' | 'assistant'

// The full cadence payload that the loader wires from server helpers to the
// CadencePanel component. Kept as one named type so the wire shape stays in
// sync across every card that consumes it — adding a field only changes here.
export type CadencePayload = {
  // False when there is no template to anchor on (freeform event) or the
  // anchor assignment was not found. Cards hide the whole cadence panel when
  // this is false — with it true, the panel still renders even if past +
  // future are both empty (that is the first-timer / template-rollout case).
  anchored: boolean
  past: CadenceEntry[]
  future: CadenceEntry[]
  // Whether the user has ever been on the anchor slot on any past event of
  // the same template, ignoring the visible-window cap. Distinguishes a
  // first-timer from a candidate that dropped out of rotation.
  hasHistory: boolean
  // True when the picker has selected the person already saved on the slot
  // being edited — a no-op confirmation the marker surfaces visually.
  savedMatchesSelection: boolean
}

// The server helpers do NOT compute the two loader-only fields (`anchored`
// and `savedMatchesSelection`) — they need the URL's slot-target context to
// resolve. The resolver wraps the helper output and appends those two.
export type CadenceHelperResult = Pick<CadencePayload, 'past' | 'future' | 'hasHistory'>
