// Which slice of an event a TemplateResponsible row delegates: the spiritual programme, or the service parts (sono,
// estrade, accueil, nettoyage), two jobs in a congregation and so two rows told apart by this column. No right reads
// the scopes: the sync turns them into each schedule template's responsible (programme → programme, service → duties,
// no fallback since 2026-11-24), and Réglages, the templates' managers' alone since 6a-1c, writes them until 6a-2.

export const ResponsibilityScope = {
  Programme: 'programme',
  Service: 'service',
} as const

export type ResponsibilityScope = (typeof ResponsibilityScope)[keyof typeof ResponsibilityScope]

export const RESPONSIBILITY_SCOPES: ResponsibilityScope[] = [ResponsibilityScope.Programme, ResponsibilityScope.Service]

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
