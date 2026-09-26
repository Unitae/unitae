import * as m from '~/i18n/paraglide/messages'

// Name and roster rules shared by the board screens and their PDF sheets, so the two cannot
// drift apart: same order, same anonymized label, same « Prénom NOM » convention.

export interface BoardPerson {
  id: number
  firstname: string | null
  lastname: string | null
  anonymizedAt: Date | null
}

export type BoardPersonName =
  | { kind: 'named'; firstname: string | null; lastname: string | null; plain: string }
  | { kind: 'anonymized'; plain: string }
  | { kind: 'empty'; plain: string }

export function formatBoardPersonName(person: Omit<BoardPerson, 'id'>): BoardPersonName {
  if (person.anonymizedAt != null) return { kind: 'anonymized', plain: m.board_read_status_anonymized_user() }
  if (!person.firstname && !person.lastname) return { kind: 'empty', plain: '—' }
  const lastname = person.lastname?.toUpperCase() ?? null
  return {
    kind: 'named',
    firstname: person.firstname,
    lastname,
    plain: [person.firstname, lastname].filter(Boolean).join(' '),
  }
}

interface GroupRosterInput<P extends BoardPerson> {
  responsible: P
  deputy: P | null
  members: P[]
}

/** Everyone in the group once — responsible and deputy included — by last then first name. */
export function buildGroupRoster<P extends BoardPerson>(group: GroupRosterInput<P>): P[] {
  const byId = new Map<number, P>()
  byId.set(group.responsible.id, group.responsible)
  if (group.deputy) byId.set(group.deputy.id, group.deputy)
  for (const member of group.members) byId.set(member.id, member)
  return [...byId.values()].sort((a, b) => {
    const left = (a.lastname ?? '').localeCompare(b.lastname ?? '', undefined, { sensitivity: 'base' })
    if (left !== 0) return left
    return (a.firstname ?? '').localeCompare(b.firstname ?? '', undefined, { sensitivity: 'base' })
  })
}

/** Sections in the order the query ranked the pioneers, which is the order they are shown. */
export function groupPioneersByType<P extends { type: string }>(pioneers: P[]): { type: string; pioneers: P[] }[] {
  const groups = new Map<string, P[]>()
  for (const pioneer of pioneers) {
    const group = groups.get(pioneer.type)
    if (group) group.push(pioneer)
    else groups.set(pioneer.type, [pioneer])
  }
  return [...groups.entries()].map(([type, members]) => ({ type, pioneers: members }))
}

export function pioneerTypeLabel(type: string): string {
  if (type === 'PionnierPermanant') return m.board_dynamic_pioneers_type_permanent()
  if (type === 'PionnierSpecial') return m.board_dynamic_pioneers_type_special()
  if (type === 'Missionnaire') return m.board_dynamic_pioneers_type_missionary()
  if (type === 'PionnierAuxiliaires') return m.board_dynamic_pioneers_type_auxiliary()
  return type
}
