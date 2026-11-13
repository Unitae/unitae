import type { OrganigramNode } from '~/shared/domain/organigram.queries'
import { bandEntries, groupLayout, serviceParts, toLayout } from '~/shared/domain/organigram-layout'
import type { ExternalSpeakerLabelSource } from '~/shared/utils/external-speaker-label'
import { stripDiacritics } from '~/shared/utils/strip-diacritics'
import { type BoardPerson, buildGroupRoster, formatBoardPersonName } from './board-roster'
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

/** Whether the search lights up a name as the document writes it. */
export function textMatches(text: string, query: string | null): boolean {
  return query != null && stripDiacritics(text).includes(query)
}

/** « Prénom NOM » as a search reads it; nothing for an anonymized person, whose name is not on the board. */
function searchableName(person: Person | null | undefined): string | null {
  if (person == null) return null
  const name = formatBoardPersonName(person)
  return name.kind === 'named' ? name.plain : null
}

/** Whether the search lights up this person's name. */
export function personMatches(person: Person | null | undefined, query: string | null): boolean {
  const name = searchableName(person)
  return name != null && textMatches(name, query)
}

/** A visiting speaker's name as a search reads it; nothing once they were deleted and their name erased. */
export function speakerName(speaker: ExternalSpeakerLabelSource): string | null {
  return speaker.anonymizedAt == null && speaker.name !== '' ? speaker.name : null
}

interface SearchablePart {
  assignee: Person | null
  assistant: Person | null
  externalSpeaker?: ExternalSpeakerLabelSource | null
}

/**
 * The names a programme part shows, as its row and its sheet write them (`assigneeRuns`): its
 * visiting speaker, or its assignee then the assistant beside them. A deleted speaker's name is
 * gone from the board, and an assistant left without an assignee shows nowhere.
 */
export function partNames(part: SearchablePart): string[] {
  if (part.externalSpeaker) {
    const name = speakerName(part.externalSpeaker)
    return name != null ? [name] : []
  }
  if (!part.assignee) return []
  return [part.assignee, part.assistant].map(searchableName).filter(name => name != null)
}

/** Whether the search lights up one of the names a programme part shows. */
export function partMatches(part: SearchablePart, query: string | null): boolean {
  return partNames(part).some(name => textMatches(name, query))
}

/** Whether this member is the person reading the document. */
export function isReader(memberId: number | null | undefined, reader: BoardReader): boolean {
  return reader.memberId != null && memberId === reader.memberId
}

interface SearchableEvent {
  templateId?: number | null
  eventParts: SearchablePart[]
  eventServiceParts?: { name: string; assignee?: Person | null }[]
}

export type SearchableDocument =
  | {
      type: typeof DynamicType.PublisherGroups
      groups: { responsible: BoardPerson; deputy: BoardPerson | null; members: BoardPerson[] }[]
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

function programmeNames(document: Extract<SearchableDocument, { type: typeof DynamicType.Programme }>): string[] {
  const options = new Map(document.config?.templates.map(t => [t.templateId, t]) ?? [])
  return document.events.flatMap(event => {
    const shown = event.templateId != null ? options.get(event.templateId) : undefined
    const parts = (shown?.parts ?? true) ? event.eventParts.flatMap(partNames) : []
    const services =
      (shown?.services ?? document.showServices)
        ? (event.eventServiceParts ?? []).map(s => searchableName(s.assignee))
        : []
    return [...parts, ...services].filter(name => name != null)
  })
}

/** Every name the document shows, each as many times as it is written. */
function documentNames(document: SearchableDocument): (string | null)[] {
  switch (document.type) {
    case DynamicType.PublisherGroups:
      // A group's leaders belong to it too, and print once, in its head.
      return document.groups.flatMap(group => buildGroupRoster(group).map(searchableName))
    case DynamicType.Pioneers:
      return document.pioneers.map(searchableName)
    case DynamicType.Organigram:
      return organigramPeople(document.tree).map(searchableName)
    case DynamicType.Programme:
      return programmeNames(document)
  }
}

/** How many names the search lights up in the document, as its viewer shows beside the search. */
export function countDocumentMatches(document: SearchableDocument, query: string | null): number {
  if (query == null) return 0
  return documentNames(document).filter(name => name != null && textMatches(name, query)).length
}
