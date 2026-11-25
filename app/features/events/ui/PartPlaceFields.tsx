import { useState } from 'react'
import * as m from '~/i18n/paraglide/messages'
import { Label } from '~/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

/** A schedule template's sections and, per section, its parallel halls in order: what a part can be put in. */
export interface PartPlaces {
  sections: string[]
  /** By section name: a Map, since a section may be named anything (« constructor » too). */
  halls: ReadonlyMap<string, { name: string; trackOrder: number | null }[]>
}

// Radix refuses an empty item value: « none » stands for no section, or no hall.
const NONE = '__none__'

/**
 * Where a part of a schedule template sits, picked among what exists (sections and halls are created from the list),
 * plus the section or hall a new part was drafted in (« Ajouter une section », a new parallel hall) while it is the
 * one chosen. Its order and its hall's order are not fields: the server places it (where it is, at the end of where it
 * is moved, or where a new part was added) and takes a hall's order from the halls.
 */
export function PartPlaceFields({
  places,
  section: initialSection,
  track: initialTrack,
  order,
}: {
  places: PartPlaces
  section: string
  track: string
  /** Its place in the order: kept while it stays in its section and hall. */
  order: number | null
}) {
  const [section, setSection] = useState(initialSection)
  const [track, setTrack] = useState(initialTrack)
  // The drafted section and hall are offered as long as they are the ones a new part was opened in.
  const sections =
    initialSection !== '' && !places.sections.includes(initialSection)
      ? [...places.sections, initialSection]
      : places.sections
  const stored = places.halls.get(section) ?? []
  const halls =
    section === initialSection && initialTrack !== '' && !stored.some(each => each.name === initialTrack)
      ? [...stored, { name: initialTrack, trackOrder: null }]
      : stored
  const kept = section === initialSection && track === initialTrack
  return (
    <>
      <input type="hidden" name="partSection" value={section} />
      <input type="hidden" name="partTrack" value={track} />
      <input type="hidden" name="partOrder" value={kept && order != null ? order : ''} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="partSection">{m.programs_edit_part_section_label()}</Label>
        <Select
          value={section === '' ? NONE : section}
          onValueChange={value => {
            setSection(value === NONE ? '' : value)
            setTrack('')
          }}
        >
          <SelectTrigger id="partSection" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{m.programs_edit_part_section_none()}</SelectItem>
            {sections.map(name => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-faint text-xs">{m.programs_edit_part_section_pick_hint()}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="partTrack">{m.programs_edit_part_track_label()}</Label>
        <Select value={track === '' ? NONE : track} onValueChange={value => setTrack(value === NONE ? '' : value)}>
          <SelectTrigger id="partTrack" className="w-full" disabled={halls.length === 0}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{m.programs_edit_part_track_none()}</SelectItem>
            {halls.map(each => (
              <SelectItem key={each.name} value={each.name}>
                {each.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-faint text-xs">{m.programs_edit_part_track_pick_hint()}</p>
      </div>
    </>
  )
}
