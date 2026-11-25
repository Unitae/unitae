import { useState } from 'react'
import { type PartPlace, type PartPlaces, pickSection, placeChoices } from '~/features/events/model/part-places'
import * as m from '~/i18n/paraglide/messages'
import { Label } from '~/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

export type { PartPlaces }

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
  const [{ section, track }, setChosen] = useState<PartPlace>({ section: initialSection, track: initialTrack })
  const {
    sections,
    halls,
    order: sentOrder,
  } = placeChoices(places, { section: initialSection, track: initialTrack, order }, { section, track })
  return (
    <>
      <input type="hidden" name="partSection" value={section} />
      <input type="hidden" name="partTrack" value={track} />
      <input type="hidden" name="partOrder" value={sentOrder} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="partSection">{m.programs_edit_part_section_label()}</Label>
        <Select
          value={section === '' ? NONE : section}
          onValueChange={value => setChosen(pickSection(value === NONE ? '' : value))}
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
        <Select
          value={track === '' ? NONE : track}
          onValueChange={value => setChosen({ section, track: value === NONE ? '' : value })}
        >
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
