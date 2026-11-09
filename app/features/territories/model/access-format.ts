import { TerritoryAccess } from '~/features/territories/model/territory-access.type'
import * as m from '~/i18n/paraglide/messages'

/** The fields the access line reads: the ordered sequence, or the older single access. */
export interface EntranceAccessSource {
  access: number | null
  accesses?: { type: number }[]
}

function formatAccessLabel(accessType: number): string {
  if (accessType === TerritoryAccess.Intercom) return m.territory_doc_access_intercom()
  if (accessType === TerritoryAccess.Code) return m.territory_doc_access_digicode()
  if (accessType === TerritoryAccess.Doorbell) return m.territory_doc_access_doorbell()
  return ''
}

export function formatAccessSequence(entrance: EntranceAccessSource): string {
  const accesses = entrance.accesses ?? []
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
