import { useId, useState } from 'react'
import { type PartPlaces, placeChoices, roomLabel, roomsAfterWhere } from '~/features/events/model/part-places'
import * as m from '~/i18n/paraglide/messages'
import { Checkbox } from '~/shared/ui/checkbox'
import { Label } from '~/shared/ui/label'
import { RadioGroup, RadioGroupItem } from '~/shared/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

export type { PartPlaces }

// Radix refuses an empty item value: « none » stands for no section.
const NONE = '__none__'

/**
 * Where a part of a schedule template sits: its section, picked among what exists (sections are created from the
 * list), plus the one a new part was drafted in; and « Où », the rooms it is held in (design « TourA-Salles-Partie »):
 * the whole congregation, in the main room, or the same part at the same time in several rooms, the main room always
 * among them. Its order is not a field: the server places it.
 */
export function PartPlaceFields({
  places,
  section: initialSection,
  roomIds,
  order,
}: {
  places: PartPlaces
  section: string
  /** The rooms it is held in; none for a new part (the main room). */
  roomIds: readonly number[]
  /** Its place in the order: kept while it stays in its section. */
  order: number | null
}) {
  const id = useId()
  const [section, setSection] = useState(initialSection)
  const others = places.rooms.filter(room => !room.isMain)
  const [parallel, setParallel] = useState(others.some(room => roomIds.includes(room.id)))
  const [ticked, setTicked] = useState<number[]>(() => others.filter(room => roomIds.includes(room.id)).map(r => r.id))
  const { sections, order: sentOrder } = placeChoices(places, { section: initialSection, order }, section)
  const held = roomsAfterWhere(places.rooms, parallel, ticked)
  const main = places.rooms.find(room => room.isMain)
  return (
    <>
      <input type="hidden" name="partSection" value={section} />
      <input type="hidden" name="partOrder" value={sentOrder} />
      <input type="hidden" name="partRoomsManaged" value="on" />
      {held.map(roomId => (
        <input key={roomId} type="hidden" name="partRooms" value={roomId} />
      ))}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="partSection">{m.programs_edit_part_section_label()}</Label>
        <Select
          value={section === '' ? NONE : section}
          onValueChange={value => setSection(value === NONE ? '' : value)}
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
        <span id={`${id}-where`} className="font-medium text-sm">
          {m.programs_edit_part_where_label()}
        </span>
        {others.length === 0 ? (
          <>
            <p className="text-sm">{m.programs_edit_part_where_single()}</p>
            <p className="text-faint text-xs">{m.programs_edit_part_where_single_hint()}</p>
          </>
        ) : (
          <RadioGroup
            aria-labelledby={`${id}-where`}
            value={parallel ? 'parallel' : 'whole'}
            onValueChange={value => setParallel(value === 'parallel')}
            className="gap-0 rounded-md border border-border"
          >
            <WhereOption
              id={`${id}-whole`}
              value="whole"
              label={m.programs_edit_part_where_whole()}
              hint={m.programs_edit_part_where_whole_hint()}
            />
            <WhereOption
              id={`${id}-parallel`}
              value="parallel"
              label={m.programs_edit_part_where_parallel()}
              hint={m.programs_edit_part_where_parallel_hint()}
            >
              {parallel && (
                <div className="flex flex-col gap-2 pt-1 pb-3 pl-[38px] pr-3">
                  {main != null && (
                    <div className="flex items-center gap-2.5 text-sm">
                      <Checkbox id={`${id}-room-${main.id}`} checked disabled />
                      <label htmlFor={`${id}-room-${main.id}`}>{roomLabel(main)}</label>
                      <span className="text-faint text-xs">{m.programs_edit_part_where_always()}</span>
                    </div>
                  )}
                  {others.map(room => (
                    <div key={room.id} className="flex items-center gap-2.5 text-sm">
                      <Checkbox
                        id={`${id}-room-${room.id}`}
                        checked={ticked.includes(room.id)}
                        onCheckedChange={checked =>
                          setTicked(current =>
                            checked === true ? [...current, room.id] : current.filter(each => each !== room.id),
                          )
                        }
                      />
                      <label htmlFor={`${id}-room-${room.id}`}>{roomLabel(room)}</label>
                    </div>
                  ))}
                  <p className="text-faint text-xs">
                    {m.programs_edit_part_where_count({ count: String(held.length) })}
                  </p>
                </div>
              )}
            </WhereOption>
          </RadioGroup>
        )}
      </div>
    </>
  )
}

function WhereOption({
  id,
  value,
  label,
  hint,
  children,
}: {
  id: string
  value: string
  label: string
  hint: string
  children?: React.ReactNode
}) {
  return (
    <div className="border-border border-b last:border-b-0">
      <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 px-3 py-2.5 text-sm">
        <RadioGroupItem id={id} value={value} className="mt-0.5" />
        <span className="flex flex-col gap-0.5">
          <span>{label}</span>
          <span className="text-faint text-xs">{hint}</span>
        </span>
      </label>
      {children}
    </div>
  )
}
