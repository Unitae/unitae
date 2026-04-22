import type { BuildingAccess } from '~/database/generated/client'
import { TerritoryAccess } from '~/features/territories/model/territory-access.type'
import * as m from '~/paraglide/messages'
import type { Entrance } from '~/shared/types/entrance'

export function formatAccessLabel(accessType: number): string {
  if (accessType === TerritoryAccess.Intercom) return m.territory_doc_access_intercom()
  if (accessType === TerritoryAccess.Code) return m.territory_doc_access_digicode()
  if (accessType === TerritoryAccess.Doorbell) return m.territory_doc_access_doorbell()
  return ''
}

export function formatAccessSequence(entrance: Entrance): string {
  const accesses: BuildingAccess[] = entrance.accesses ?? []
  if (accesses.length > 0) {
    return accesses
      .map(a => formatAccessLabel(a.type))
      .filter(Boolean)
      .join(' → ')
  }

  // Fallback to old single access field
  if (entrance.access != null) {
    return formatAccessLabel(entrance.access)
  }

  return ''
}
