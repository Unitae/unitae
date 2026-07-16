// Publish workflow state on Event. Draft events are the manager's scratch
// space — invisible to the display board, notifications, publisher-facing
// dashboards, and conflict queries. Released events are public. See
// releaseEvent / unreleaseEvent for the transitions.
//
// Centralised here so the two literal strings stop drifting across dashboard,
// events, display-board, and notify-assignment.

export const EventStatus = {
  Draft: 'draft',
  Released: 'released',
} as const

export type EventStatus = (typeof EventStatus)[keyof typeof EventStatus]
