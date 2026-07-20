// Single source of truth for the three roles an assignee can hold on an
// event part or event service part. The Zod schema in
// `notifications.server.tsx`, the notify-assignment helper, and both email
// templates all derive from this const — adding a new role (e.g. 'chairman')
// is a one-line edit that fails compile everywhere the enum is spelled out.
export const PROGRAMME_ROLES = ['speaker', 'reader', 'servant'] as const

export type ProgrammeRole = (typeof PROGRAMME_ROLES)[number]
