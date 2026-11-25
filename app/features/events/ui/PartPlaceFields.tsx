import { useState } from 'react'
import * as m from '~/i18n/paraglide/messages'
import { Label } from '~/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

/** A schedule template's sections and, per section, its parallel halls in order: what a part can be put in. */
export interface PartPlaces {
  sections: string[]
  halls: Record<string, { name: string; trackOrder: number | null }[]>
}

// Radix refuses an empty item value: « none » stands for no section, or no hall.
const NONE = '__none__'

/**
 * Where a part of a schedule template sits, picked among what exists (sections and halls are created from the list).
 * Its order is not a field: it stays where it is, and goes to the end of the section or hall it is moved to (the
 * server places it). A new part keeps the place it was added at while left in its section and hall.
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
  const halls = places.halls[section] ?? []
  const hall = halls.find(each => each.name === track)
  const kept = section === initialSection && track === initialTrack
  return (
    <>
      <input type="hidden" name="partSection" value={section} />
      <input type="hidden" name="partTrack" value={track} />
      <input type="hidden" name="partTrackOrder" value={hall?.trackOrder ?? ''} />
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
            {places.sections.map(name => (
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
