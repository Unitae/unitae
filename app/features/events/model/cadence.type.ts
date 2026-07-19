// One entry per instance of the recurring event in the CadenceStrip. Client
// and server files share this shape; keeping it here avoids drift between
// the loader payload and the strip / warnings components.
export type CadenceEntry = { date: string; assigned: boolean }

// The two role slots on a part assignment. Speaker (assignee) and reader
// (assistant) are distinct rotation buckets — a person who was the speaker
// one week shouldn't light up the reader cadence the next week.
export type PartSlot = 'assignee' | 'assistant'
