import { EntranceKind, entranceKindLabels } from '~/features/territories/model/entrance-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import * as m from '~/i18n/paraglide/messages'

type EntranceLike = {
  kind: EntranceKind
  shopKind: string | null
  homes: number | null
  phones: number | null
}

function capitalize(value: string): string {
  if (value.length === 0) return value
  return value.charAt(0).toLocaleUpperCase() + value.slice(1)
}

export function entranceContentLabel(territoryType: TerritoryKind, entrance: EntranceLike): string {
  const labels = entranceKindLabels()

  if (entrance.kind === EntranceKind.Commerce) {
    const shop = entrance.shopKind?.trim()
    return shop != null && shop.length > 0 ? capitalize(shop) : labels[EntranceKind.Commerce]
  }

  if (entrance.kind === EntranceKind.Hotel) return labels[EntranceKind.Hotel]
  if (entrance.kind === EntranceKind.Campus) return labels[EntranceKind.Campus]
  if (entrance.kind === EntranceKind.Laundromat) return labels[EntranceKind.Laundromat]

  // Residential entrance: pick the count that matches the territory's purpose.
  if (territoryType === TerritoryKind.Phone) {
    return m.territories_content_phones({ count: entrance.phones ?? 0 })
  }
  const homes = entrance.homes ?? entrance.phones ?? 0
  return homes > 1 ? m.territories_content_homes_other({ count: homes }) : m.territories_content_homes_one({ count: homes })
}
