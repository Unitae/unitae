import type { OrganigramNode } from '~/shared/domain/organigram.queries'
import { bandEntries, groupLayout, serviceParts, toLayout } from '~/shared/domain/organigram-layout'
import { stripDiacritics } from '~/shared/utils/strip-diacritics'
import { type BoardPerson, formatBoardPersonName } from './board-roster'
import { DynamicType } from './dynamic-document.type'

// What a board document does for the person reading it on screen, and never prints: find a name,
// mark their own, open what their rights open. The paper sheet knows none of this.

/** Who reads the document: their own member, and which pages their rights open. */
export interface BoardReader {
  /** Null for an account with no member record: nothing on the board is theirs. */
  memberId: number | null
  canViewPublishers: boolean
  canViewRoles: boolean
  canViewPrograms: boolean
}

type Person = Omit<BoardPerson, 'id'>

/** The search as names are compared: no accents, no case. Null under two letters, which match too much to help. */
export function boardSearchQuery(raw: string): string | null {
  const query = stripDiacritics(raw.trim())
  return query.length >= 2 ? query : null
}

/** Whether the search lights up this name. An anonymized person never matches: their name is not on the board. */
export function personMatches(person: Person | null | undefined, query: string | null): boolean {
  if (query == null || person == null) return false
  const name = formatBoardPersonName(person)
  return name.kind === 'named' && stripDiacritics(name.plain).includes(query)
}

/** Whether this member is the person reading the document. */
export function isReader(memberId: number | null | undefined, reader: BoardReader): boolean {
  return reader.memberId != null && memberId === reader.memberId
}

interface SearchableEvent {
  templateId?: number | null
  eventParts: { assignee: Person | null; assistant: Person | null }[]
  eventServiceParts?: { name: string; assignee?: Person | null }[]
}

export type SearchableDocument =
  | {
      type: typeof DynamicType.PublisherGroups
      groups: { responsible: Person; deputy: Person | null; members: Person[] }[]
    }
  | { type: typeof DynamicType.Pioneers; pioneers: Person[] }
  | { type: typeof DynamicType.Organigram; tree: OrganigramNode[] }
  | {
      type: typeof DynamicType.Programme
      events: SearchableEvent[]
      config: { templates: { templateId: number; parts: boolean; services: boolean }[] } | null
      showServices: boolean
    }

/**
 * The people the organigram prints, read from the same layout its views draw: the rosters whole,
 * each committee post's titulaire and adjoints, then who each service row names (`serviceParts`).
 */
function organigramPeople(tree: OrganigramNode[]): Person[] {
  const { rosters, committee, sections, legacy } = groupLayout(toLayout(tree))
  const rows = [
    ...sections.flatMap(section => bandEntries(section.bands)),
    ...legacy.flatMap(block => (block.kind === 'row' ? [{ node: block.node, rows: null }] : bandEntries([block]))),
  ]
  return [
    ...rosters.flatMap(roster => roster.node.holders),
    ...(committee?.posts.flatMap(post => post.holders.filter(h => h.kind === 'leader' || h.kind === 'deputy')) ?? []),
    ...rows.flatMap(({ node, rows: children }) => serviceParts(node, children).holders),
  ]
}

function programmePeople(document: Extract<SearchableDocument, { type: typeof DynamicType.Programme }>): Person[] {
  const options = new Map(document.config?.templates.map(t => [t.templateId, t]) ?? [])
  return document.events.flatMap(event => {
    const shown = event.templateId != null ? options.get(event.templateId) : undefined
    const parts = (shown?.parts ?? true) ? event.eventParts.flatMap(part => [part.assignee, part.assistant]) : []
    const services =
      (shown?.services ?? document.showServices) ? (event.eventServiceParts ?? []).map(s => s.assignee) : []
    return [...parts, ...services].filter((person): person is Person => person != null)
  })
}

function documentPeople(document: SearchableDocument): Person[] {
  switch (document.type) {
    case DynamicType.PublisherGroups:
      return document.groups.flatMap(group => [
        group.responsible,
        ...(group.deputy ? [group.deputy] : []),
        ...group.members,
      ])
    case DynamicType.Pioneers:
      return document.pioneers
    case DynamicType.Organigram:
      return organigramPeople(document.tree)
    case DynamicType.Programme:
      return programmePeople(document)
  }
}

/** How many names the search lights up in the document, as its viewer shows beside the search. */
export function countDocumentMatches(document: SearchableDocument, query: string | null): number {
  if (query == null) return 0
  return documentPeople(document).filter(person => personMatches(person, query)).length
}
