import { Panel, StatusIcon, Tag } from '@unitae/ui'
import { type ReactNode, useId } from 'react'

import type { HolderEntrance, StreetGroup } from '~/features/territories/model/holder-territory'
import { type ShopKind, shopKindLabels } from '~/features/territories/model/shop-kind.type'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import * as m from '~/i18n/paraglide/messages'
import { cn } from '~/shared/utils/utils'

/** Which entrance the pointer is on and which one is open on the map, shared by the list and the map. */
export interface EntranceFocus {
  hoveredId: number | null
  selectedId: number | null
  onHover: (id: number | null) => void
  onSelect: (id: number) => void
}

interface HolderEntranceListProps {
  streets: StreetGroup[]
  territoryType: string
  /** Show phone counts on a door-to-door territory, as the congregation's settings ask. */
  showPhone: boolean
  /** Given when the map is shown: each row then points at its pins and opens its card. */
  focus?: EntranceFocus
  /** An action at the end of each row, shown on hover; never inside the row's button. */
  entranceAction?: (entrance: HolderEntrance) => ReactNode
}

/** The id of an entrance's row, for « Voir dans la liste » to bring it into view. */
export function entranceRowId(id: number): string {
  return `entrance-${id}`
}

/** The territory's entrances street by street, numbers in walking order, as its holder reads them on the doorstep. */
export function HolderEntranceList({
  streets,
  territoryType,
  showPhone,
  focus,
  entranceAction,
}: HolderEntranceListProps) {
  // A postcode only helps when two of them meet in the same territory.
  const showZip = new Set(streets.map(street => street.zip)).size > 1
  return (
    <Panel aria-label={m.my_territories_entrances_label()}>
      {streets.map(street => (
        <StreetSection
          key={`${street.street}|${street.zip}`}
          street={street}
          showZip={showZip}
          territoryType={territoryType}
          showPhone={showPhone}
          focus={focus}
          entranceAction={entranceAction}
        />
      ))}
    </Panel>
  )
}

function StreetSection({
  street,
  showZip,
  territoryType,
  showPhone,
  focus,
  entranceAction,
}: {
  street: StreetGroup
  showZip: boolean
  territoryType: string
  showPhone: boolean
  focus?: EntranceFocus
  entranceAction?: (entrance: HolderEntrance) => ReactNode
}) {
  const headingId = useId()
  const isPhone = territoryType === TerritoryKindKey.Phone
  const count = street.entrances.length
  const phones = street.entrances.reduce((sum, entrance) => sum + entrance.phones, 0)
  const meta = [
    showZip ? street.zip : null,
    count > 1 ? m.territories_content_entrances_other({ count }) : m.territories_content_entrances_one({ count }),
    isPhone
      ? m.my_territories_phones_count({ count: phones })
      : street.homes > 0
        ? m.my_territories_homes_count({ count: street.homes })
        : null,
  ].filter(Boolean)

  return (
    <section aria-labelledby={headingId} className="border-border border-t first:border-t-0">
      <h2
        id={headingId}
        className="flex flex-wrap items-baseline gap-x-2 border-border border-b bg-sidebar px-3.5 py-2 text-sm md:px-4"
      >
        <span className="font-semibold">{street.street}</span>
        <span className="text-faint tabular-nums">{meta.join(' · ')}</span>
      </h2>
      <ul>
        {street.entrances.map(entrance => (
          <EntranceRow
            key={entrance.id}
            entrance={entrance}
            territoryType={territoryType}
            showPhone={showPhone}
            focus={focus}
            action={entranceAction?.(entrance)}
          />
        ))}
      </ul>
    </section>
  )
}

/** How to get in and what is behind the door, in the order the holder needs them on the doorstep. */
export function entranceFacts(entrance: HolderEntrance, territoryType: string, showPhone: boolean): string[] {
  const isPhone = territoryType === TerritoryKindKey.Phone
  const facts: string[] = []
  if (!isPhone && entrance.homes > 0) facts.push(m.my_territories_homes_count({ count: entrance.homes }))
  if ((isPhone || showPhone) && entrance.phones > 0) facts.push(m.territory_doc_phone_abbr({ count: entrance.phones }))
  if (entrance.openEarly) facts.push(m.my_territories_open_morning())
  if (entrance.mailboxOpen) facts.push(m.my_territories_mailbox_open())
  return facts
}

/** A shop's kind, as its tag reads. */
export function shopKindLabel(entrance: HolderEntrance): string {
  return shopKindLabels()[entrance.shopKind as ShopKind] ?? m.territory_doc_shop_fallback()
}

// 40 px rows from the tablet up, as every list; a little taller on a phone, where a finger reads them.
const ROW =
  'grid grid-cols-[3.75rem_minmax(0,1fr)] gap-3 px-3.5 py-2.5 md:grid-cols-[4.5rem_minmax(0,1fr)] md:px-4 md:py-2'

function EntranceRow({
  entrance,
  territoryType,
  showPhone,
  focus,
  action,
}: {
  entrance: HolderEntrance
  territoryType: string
  showPhone: boolean
  focus?: EntranceFocus
  action?: ReactNode
}) {
  const isShops = territoryType === TerritoryKindKey.Commerces
  const lead = isShops ? m.my_territories_shop() : entrance.access
  const facts = isShops ? [] : entranceFacts(entrance, territoryType, showPhone)
  const content: ReactNode = (
    <>
      <span className="font-semibold tabular-nums">{entrance.numbers.join(', ')}</span>
      <span className="flex min-w-0 flex-col gap-1">
        {(lead !== '' || facts.length > 0) && (
          // One line from the tablet up; on a phone the way in, then what is behind the door under it.
          <span className="flex flex-col gap-0.5 md:flex-row md:flex-wrap md:items-center md:gap-x-3">
            {lead !== '' && <span className="text-base">{lead}</span>}
            {(isShops || facts.length > 0) && (
              <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-faint text-sm">
                {isShops && <Tag>{shopKindLabel(entrance)}</Tag>}
                {facts.map(fact => (
                  <span key={fact} className="tabular-nums">
                    {fact}
                  </span>
                ))}
              </span>
            )}
          </span>
        )}
        {entrance.notes !== '' && <EntranceNote notes={entrance.notes} />}
      </span>
    </>
  )

  // Beside the row's button, never inside it: a link cannot sit in a button.
  const corner = action != null && (
    <span className="absolute top-1.5 right-2 opacity-0 transition-opacity duration-(--u-duration-fast) focus-within:opacity-100 group-hover/entrance:opacity-100 pointer-coarse:opacity-100">
      {action}
    </span>
  )

  if (focus == null) {
    return (
      <li
        id={entranceRowId(entrance.id)}
        className={cn(ROW, 'group/entrance relative border-border border-b last:border-b-0', action != null && 'pr-12')}
      >
        {content}
        {corner}
      </li>
    )
  }

  const selected = focus.selectedId === entrance.id
  const hovered = focus.hoveredId === entrance.id
  return (
    <li id={entranceRowId(entrance.id)} className="group/entrance relative border-border border-b last:border-b-0">
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => focus.onSelect(entrance.id)}
        onMouseEnter={() => focus.onHover(entrance.id)}
        onMouseLeave={() => focus.onHover(null)}
        onFocus={() => focus.onHover(entrance.id)}
        onBlur={() => focus.onHover(null)}
        className={cn(
          ROW,
          'w-full cursor-pointer text-left transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2',
          hovered && 'bg-hover',
          selected && 'bg-selected hover:bg-selected',
          action != null && 'pr-12',
        )}
      >
        {content}
      </button>
      {corner}
    </li>
  )
}

/** The information for publishers, flagged rather than painted red. */
export function EntranceNote({ notes }: { notes: string }) {
  return (
    <span className="flex items-start gap-2 text-sm">
      <StatusIcon tone="warning" className="mt-1" />
      <span className="whitespace-pre-line">
        <span className="sr-only">{m.my_territories_entrance_note()} </span>
        {notes}
      </span>
    </span>
  )
}
