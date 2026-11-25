import * as m from '~/i18n/paraglide/messages'

/** One of a programme template's rooms: the main room's name stays null until someone names it. */
export interface PartRoom {
  id: number
  name: string | null
  isMain: boolean
}

/** What a schedule template part can be put in: the template's sections, and its rooms, the main room first. */
export interface PartPlaces {
  sections: string[]
  rooms: PartRoom[]
}

/** A room as the page writes it: an unnamed main room is « Salle principale », in the reader's language. */
export const roomLabel = (room: PartRoom) => room.name ?? (room.isMain ? m.settings_schedule_templates_main_hall() : '')

/**
 * What a schedule template part's section picker offers, and the order the form sends. The sections, plus the one a
 * new part was drafted in (« Ajouter une section »). The order is sent only while the part stays in the section it
 * was opened in (a new part's place in the list); moved, the server puts it at the end of where it goes.
 */
export function placeChoices(places: PartPlaces, opened: { section: string; order: number | null }, chosen: string) {
  const sections =
    opened.section !== '' && !places.sections.includes(opened.section)
      ? [...places.sections, opened.section]
      : places.sections
  return { sections, order: chosen === opened.section && opened.order != null ? String(opened.order) : '' }
}

/**
 * The rooms « Où » holds a part in: the main room alone for the whole congregation; the main room and the rooms ticked
 * when in parallel (decided 2026-11-25: the main room always takes part). In the rooms' order; a room gone is left out.
 */
export function roomsAfterWhere(rooms: readonly PartRoom[], parallel: boolean, ticked: readonly number[]): number[] {
  return rooms.filter(room => room.isMain || (parallel && ticked.includes(room.id))).map(room => room.id)
}

/** The rooms a save takes a part out of (what the confirmation names); none for a new part. */
export function roomsTakenAway(
  rooms: readonly PartRoom[],
  before: readonly number[] | null,
  after: readonly number[],
): PartRoom[] {
  if (before == null) return []
  return rooms.filter(room => before.includes(room.id) && !after.includes(room.id))
}
