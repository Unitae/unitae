import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import * as m from '~/paraglide/messages'

type EntranceLike = { homes: number | null; phones: number | null }

export function territoryContentLabel(type: TerritoryKind, entrances: EntranceLike[]): string {
  if (type === TerritoryKind.Phone) {
    const count = entrances.reduce((acc, e) => acc + (e.phones ?? 0), 0)
    return m.territories_content_phones({ count })
  }
  if (type === TerritoryKind.Classical || type === TerritoryKind.Univ) {
    const count = entrances.reduce((acc, e) => acc + ((e.homes ?? 0) || (e.phones ?? 0)), 0)
    return count > 1 ? m.territories_content_homes_other({ count }) : m.territories_content_homes_one({ count })
  }
  const count = entrances.length
  if (type === TerritoryKind.Commerces) {
    return count > 1 ? m.territories_content_commerces_other({ count }) : m.territories_content_commerces_one({ count })
  }
  if (type === TerritoryKind.Hotel) {
    return count > 1 ? m.territories_content_hotels_other({ count }) : m.territories_content_hotels_one({ count })
  }
  return count > 1 ? m.territories_content_entrances_other({ count }) : m.territories_content_entrances_one({ count })
}
