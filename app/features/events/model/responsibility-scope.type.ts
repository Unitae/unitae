import { ScheduleKind } from './schedule.type'

// Which slice of an event a TemplateResponsible row delegates. Since 5a no right reads the scopes: the sync turns
// them into each schedule template's responsible (programme → programme, service → duties, no fallback since
// 2026-11-24), and only Réglages still reads them (its templates list and
// page, reordering, access, export and import), until PR 6 rewrites them per schedule template; the absences' « who
// to contact » reads each schedule template's responsible since 6a-0. The asymmetry below matters only there now.
//
// A template can name two roles: one for the spiritual programme and one for
// the service parts (sono, estrade, accueil, nettoyage). They are different
// jobs in a congregation — the brother who fills the sound desk rota is not
// the one who assigns the public talk — so they are two rows on
// TemplateResponsible, told apart by this column, rather than two tables.
//
// The scopes are NOT peers in Réglages: a kind's programme responsible may open and edit the kind's page, services
// included, while 'service' reaches only them. Every such check goes through `scopesCovering` /
// `scheduleKindsCovering` so that asymmetry lives in one place. On a meeting it no longer holds: a schedule's rights
// come from its own template's responsible alone, and the duties have none unless the kind names a services one.

export const ResponsibilityScope = {
  Programme: 'programme',
  Service: 'service',
} as const

export type ResponsibilityScope = (typeof ResponsibilityScope)[keyof typeof ResponsibilityScope]

export const RESPONSIBILITY_SCOPES: ResponsibilityScope[] = [ResponsibilityScope.Programme, ResponsibilityScope.Service]

/**
 * The scopes whose holders satisfy a request for `scope`.
 *
 * Asking for the service parts accepts either delegation; asking for the
 * programme accepts only the programme one.
 */
export function scopesCovering(scope: ResponsibilityScope): ResponsibilityScope[] {
  // A fresh array, never RESPONSIBILITY_SCOPES itself: the result goes straight into a Prisma
  // `in:` filter, and handing out the module-level catalogue makes it one careless push away
  // from silently widening every authorisation check in the app.
  return scope === ResponsibilityScope.Service
    ? [ResponsibilityScope.Programme, ResponsibilityScope.Service]
    : [ResponsibilityScope.Programme]
}

/**
 * The schedule template kinds whose responsible answers for `scope` in Réglages access: the kind's page stays open to
 * its programme lead, services included, so asking about the services also accepts the programme's template. Not a
 * meeting right: there, the duties answer to their own template's responsible only.
 */
export function scheduleKindsCovering(scope: ResponsibilityScope): ScheduleKind[] {
  // A fresh array per call, as scopesCovering: it goes straight into a Prisma `in:` filter.
  return scope === ResponsibilityScope.Service ? [ScheduleKind.Programme, ScheduleKind.Duty] : [ScheduleKind.Programme]
}

/**
 * The row for exactly one scope out of an included `responsibles` relation.
 *
 * Deliberately an exact match, not a covering one: the settings screens show
 * "who is named here", and a template with only a programme responsible must
 * render an empty service picker rather than echoing the programme role back.
 */
export function findResponsible<T extends { scope: string }>(responsibles: T[], scope: ResponsibilityScope): T | null {
  return responsibles.find(row => row.scope === scope) ?? null
}
