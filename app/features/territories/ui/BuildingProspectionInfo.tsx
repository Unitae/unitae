import { Callout, Panel } from '@unitae/ui'
import type { Building, BuildingEntrance } from '~/database/generated/client'
import {
  EntranceKind,
  entranceKindLabels as getEntranceKindLabels,
} from '~/features/territories/model/entrance-kind.type'
import { shopKindLabels as getShopKindLabels, type ShopKind } from '~/features/territories/model/shop-kind.type'
import { TerritoryAccess } from '~/features/territories/model/territory-access.type'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'

type BuildingWithEntrances = Building & { entrances: BuildingEntrance[] }

function getAccessLabels(): Record<number, string> {
  return {
    [TerritoryAccess.Intercom]: m.prospection_info_access_intercom(),
    [TerritoryAccess.Code]: m.prospection_info_access_digicode(),
    [TerritoryAccess.Doorbell]: m.prospection_info_access_doorbell(),
  }
}

export default function BuildingProspectionInfo({ building }: { building: BuildingWithEntrances }) {
  const residentialEntrance = building.entrances.find(e => e.kind === EntranceKind.Residential)
  const commerceEntrances = building.entrances.filter(e => e.kind === EntranceKind.Commerce)
  const otherEntrances = building.entrances.filter(
    e => e.kind !== EntranceKind.Residential && e.kind !== EntranceKind.Commerce,
  )
  const allNotes = building.entrances.filter(e => e.notes.length > 0)
  const hasProspectionData = building.prospectionDate != null || building.entrances.length > 0

  if (!hasProspectionData) {
    return (
      <Panel title={m.prospection_info_title()} padded>
        <p className="m-0 text-muted-foreground text-sm">{m.prospection_info_no_data()}</p>
      </Panel>
    )
  }

  return (
    <Panel title={m.prospection_info_title()} padded>
      <div className="flex flex-col gap-2 text-sm">
        {residentialEntrance != null && <ResidentialSummary entrance={residentialEntrance} />}

        {residentialEntrance == null && <p className="m-0">{m.prospection_info_no_residential()}</p>}

        {commerceEntrances.length > 0 && <CommerceSummary entrances={commerceEntrances} />}

        {otherEntrances.map(entrance => (
          <OtherEntranceSummary key={entrance.id} entrance={entrance} />
        ))}

        {allNotes.length > 0 && (
          <Callout tone="warning" className="mt-1">
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-foreground">
              {allNotes.map(entrance => (
                <li key={entrance.id}>
                  <span className="font-medium">{getEntranceKindLabels()[entrance.kind] ?? entrance.kind} :</span>{' '}
                  {entrance.notes}
                </li>
              ))}
            </ul>
          </Callout>
        )}

        {building.prospectionDate != null && (
          <p className="m-0 mt-1 text-muted-foreground">
            {m.prospection_info_last_prospection({
              date: building.prospectionDate.toLocaleDateString(getLocale(), {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              }),
            })}
          </p>
        )}

        <p className="m-0 text-faint text-xs">{m.prospection_info_edit_hint()}</p>
      </div>
    </Panel>
  )
}

function describeResidentialCounts(entrance: BuildingEntrance): string[] {
  const homes = entrance.homes ?? 0
  const phones = entrance.phones ?? 0
  const liberals = entrance.liberals ?? 0
  const parts: string[] = []

  if (homes > 0) parts.push(m.territories_content_homes({ count: homes }))
  if (phones > 0) parts.push(m.prospection_info_phones_count({ count: phones }))
  if (liberals > 0) parts.push(m.prospection_info_liberals_count({ count: liberals }))

  return parts
}

function describeAccess(entrance: BuildingEntrance): string[] {
  const parts: string[] = []
  const accessLabels = getAccessLabels()
  const label = entrance.access != null ? accessLabels[entrance.access] : null

  if (label != null) parts.push(label)
  if (entrance.access === TerritoryAccess.Code && entrance.isOpenEarly) parts.push(m.prospection_info_open_early())
  if (entrance.access === TerritoryAccess.Code && entrance.isMailboxOpen) parts.push(m.prospection_info_mailbox_open())
  if (entrance.isPMR) parts.push(m.prospection_info_pmr())

  return parts
}

function ResidentialSummary({ entrance }: { entrance: BuildingEntrance }) {
  const counts = describeResidentialCounts(entrance)
  const accessParts = describeAccess(entrance)

  if (counts.length === 0) {
    return <p>{m.prospection_info_residential_empty()}</p>
  }

  return (
    <p>
      {m.prospection_info_building_contains()} <span className="font-medium">{counts.join(', ')}</span>
      {accessParts.length > 0 && (
        <>
          {' '}
          (<span className="text-muted-foreground">{accessParts.join(', ')}</span>)
        </>
      )}
      .
    </p>
  )
}

function CommerceSummary({ entrances }: { entrances: BuildingEntrance[] }) {
  if (entrances.length === 1) {
    const shopLabel = getShopKindLabels()[entrances[0].shopKind as ShopKind] ?? m.prospection_info_commerce_fallback()
    return <p>{m.prospection_info_commerce_single({ type: shopLabel.toLowerCase() })}</p>
  }

  const labels = entrances.map(
    e => getShopKindLabels()[e.shopKind as ShopKind]?.toLowerCase() ?? m.prospection_info_other_fallback(),
  )

  return <p>{m.prospection_info_commerce_multiple({ count: entrances.length, labels: labels.join(', ') })}</p>
}

function OtherEntranceSummary({ entrance }: { entrance: BuildingEntrance }) {
  const kindLabel = getEntranceKindLabels()[entrance.kind]?.toLowerCase() ?? entrance.kind

  if (entrance.kind === EntranceKind.Hotel) {
    return <p>{m.prospection_info_hotel()}</p>
  }

  if (entrance.kind === EntranceKind.Campus) {
    return <p>{m.prospection_info_campus()}</p>
  }

  if (entrance.kind === EntranceKind.Laundromat) {
    return <p>{m.prospection_info_laundromat()}</p>
  }

  return <p>{m.prospection_info_other_entrance({ type: kindLabel })}</p>
}
