/** A schedule template's sections and, per section, its parallel halls in order: what a part can be put in. */
export interface PartPlaces {
  sections: string[]
  /** By section name: a Map, since a section may be named anything (« constructor » too). */
  halls: ReadonlyMap<string, { name: string; trackOrder: number | null }[]>
}

/** A part's section and hall: where it was opened, or where its form has it now. */
export interface PartPlace {
  section: string
  track: string
}

/**
 * What a schedule template part's place pickers offer, and the order the form sends. The sections and the chosen
 * section's halls, plus the section or hall a new part was drafted in (« Ajouter une section », a new parallel hall)
 * while it is the one chosen. The order is sent only while the part stays where it was opened (a new part's place in
 * the list); moved, the server puts it at the end of where it goes.
 */
export function placeChoices(places: PartPlaces, opened: PartPlace & { order: number | null }, chosen: PartPlace) {
  const sections =
    opened.section !== '' && !places.sections.includes(opened.section)
      ? [...places.sections, opened.section]
      : places.sections
  const stored = places.halls.get(chosen.section) ?? []
  const halls =
    chosen.section === opened.section && opened.track !== '' && !stored.some(each => each.name === opened.track)
      ? [...stored, { name: opened.track, trackOrder: null }]
      : stored
  const kept = chosen.section === opened.section && chosen.track === opened.track
  return { sections, halls, order: kept && opened.order != null ? String(opened.order) : '' }
}

/** Another section picked: its hall starts at none, the halls being the section's own. */
export const pickSection = (section: string): PartPlace => ({ section, track: '' })
