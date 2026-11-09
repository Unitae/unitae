import { Panel, StatusIcon, Tag } from '@unitae/ui'
import { useId } from 'react'

import type { HolderEntrance, StreetGroup } from '~/features/territories/model/holder-territory'
import { type ShopKind, shopKindLabels } from '~/features/territories/model/shop-kind.type'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import * as m from '~/i18n/paraglide/messages'

interface HolderEntranceListProps {
  streets: StreetGroup[]
  territoryType: string
  /** Show phone counts on a door-to-door territory, as the congregation's settings ask. */
  showPhone: boolean
}

/** The territory's entrances street by street, numbers in walking order, as its holder reads them on the doorstep. */
export function HolderEntranceList({ streets, territoryType, showPhone }: HolderEntranceListProps) {
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
}: {
  street: StreetGroup
  showZip: boolean
  territoryType: string
  showPhone: boolean
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
          <EntranceRow key={entrance.id} entrance={entrance} territoryType={territoryType} showPhone={showPhone} />
        ))}
      </ul>
    </section>
  )
}

/** How to get in and what is behind the door, in the order the holder needs them on the doorstep. */
function entranceFacts(entrance: HolderEntrance, territoryType: string, showPhone: boolean): string[] {
  const isPhone = territoryType === TerritoryKindKey.Phone
  const facts: string[] = []
  if (!isPhone && entrance.homes > 0) facts.push(m.my_territories_homes_count({ count: entrance.homes }))
  if ((isPhone || showPhone) && entrance.phones > 0) facts.push(m.territory_doc_phone_abbr({ count: entrance.phones }))
  if (entrance.openEarly) facts.push(m.my_territories_open_morning())
  if (entrance.mailboxOpen) facts.push(m.my_territories_mailbox_open())
  return facts
}

function EntranceRow({
  entrance,
  territoryType,
  showPhone,
}: {
  entrance: HolderEntrance
  territoryType: string
  showPhone: boolean
}) {
  const isShops = territoryType === TerritoryKindKey.Commerces
  const lead = isShops ? m.my_territories_shop() : entrance.access
  const facts = isShops ? [] : entranceFacts(entrance, territoryType, showPhone)

  return (
    <li className="grid grid-cols-[3.75rem_minmax(0,1fr)] gap-3 border-border border-b px-3.5 py-2.5 last:border-b-0 md:grid-cols-[4.5rem_minmax(0,1fr)] md:px-4">
      <span className="font-semibold tabular-nums">{entrance.numbers.join(', ')}</span>
      <span className="flex min-w-0 flex-col gap-1">
        {(lead !== '' || facts.length > 0) && (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-faint text-sm">
            {lead !== '' && <span className="text-base text-foreground">{lead}</span>}
            {isShops && <Tag>{shopKindLabels()[entrance.shopKind as ShopKind] ?? m.territory_doc_shop_fallback()}</Tag>}
            {facts.map(fact => (
              <span key={fact} className="tabular-nums">
                {fact}
              </span>
            ))}
          </span>
        )}
        {entrance.notes !== '' && <EntranceNote notes={entrance.notes} />}
      </span>
    </li>
  )
}

/** The information for publishers, flagged rather than painted red. */
function EntranceNote({ notes }: { notes: string }) {
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
