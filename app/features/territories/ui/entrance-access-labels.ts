import * as m from '~/i18n/paraglide/messages'
import { TerritoryAccess } from '../model/territory-access.type'

/** What an entrance records about getting in; every field may be missing on an entrance not surveyed yet. */
export interface EntranceAccessFacts {
  access?: number | null
  accesses?: { type: number }[]
  isPMR?: boolean | null
  isOpenEarly?: boolean | null
  isMailboxOpen?: boolean | null
}

/**
 * How to get in, as the map's entrance card says it: interphone, digicode, sonnette (the main way in and the others),
 * what a code allows (ouvre tôt, boîtes accessibles), and accessible PMR. Empty when nothing is known.
 */
export function entranceAccessLabels(entrance: EntranceAccessFacts): string[] {
  const has = (type: TerritoryAccess) =>
    entrance.access === type || (entrance.accesses ?? []).some(access => access.type === type)
  const code = has(TerritoryAccess.Code)
  const labels: string[] = []
  if (has(TerritoryAccess.Intercom)) labels.push(m.territories_map_popup_access_intercom())
  if (code) labels.push(m.territories_map_popup_access_digicode())
  if (has(TerritoryAccess.Doorbell)) labels.push(m.territories_map_popup_access_doorbell())
  if (code && entrance.isOpenEarly === true) labels.push(m.territories_map_popup_access_open_early())
  if (code && entrance.isMailboxOpen === true) labels.push(m.territories_map_popup_access_mailbox_open())
  if (entrance.isPMR === true) labels.push(m.territories_map_popup_access_pmr())
  return labels
}
