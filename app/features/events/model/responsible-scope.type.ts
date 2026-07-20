// Edit-authority scope on a TemplateResponsible. A template can carry one
// responsible per scope (enforced by the @@unique([templateId, scope, ...])
// index in schema.prisma).
//
//   - full:    whole-event edit rights (structure, program parts, services,
//              info, release/unrelease/delete) — the original responsible.
//   - service: services section only (assign/unassign service publishers,
//              service notes, add/remove service rows). No release/delete.
//
// Centralised here so the two literal strings stop drifting across events,
// settings, and dashboard. Mirrors event-status.type.ts.

export const ResponsibleScope = {
  Full: 'full',
  Service: 'service',
} as const

export type ResponsibleScope = (typeof ResponsibleScope)[keyof typeof ResponsibleScope]
