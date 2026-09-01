// Which slice of an event a TemplateResponsible row delegates.
//
// A template can name two roles: one for the spiritual programme and one for
// the service parts (sono, estrade, accueil, nettoyage). They are different
// jobs in a congregation — the brother who fills the sound desk rota is not
// the one who assigns the public talk — so they are two rows on
// TemplateResponsible, told apart by this column, rather than two tables.
//
// The scopes are NOT peers. 'programme' is the whole-event delegation and has
// always meant "may edit everything on this event", so it also covers the
// service parts; 'service' covers only them. Every check goes through
// `scopesCovering` so that asymmetry lives in one place.

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
 * The row for exactly one scope out of an included `responsibles` relation.
 *
 * Deliberately an exact match, not a covering one: the settings screens show
 * "who is named here", and a template with only a programme responsible must
 * render an empty service picker rather than echoing the programme role back.
 */
export function findResponsible<T extends { scope: string }>(responsibles: T[], scope: ResponsibilityScope): T | null {
  return responsibles.find(row => row.scope === scope) ?? null
}
