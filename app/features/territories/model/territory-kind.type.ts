/**
 * The key set of the built-in territory kinds. `TerritoryKind` (the table) is
 * the entity — this enum names its built-in keys and still types
 * `Territory.type` until territories move onto the FK.
 */
import { TerritoryKindKey } from '~/database/generated/enums'
import * as m from '~/i18n/paraglide/messages'

export { TerritoryKindKey }

/** Plural labels for the territory list columns. */
export function territoryTypeLabels(): Record<TerritoryKindKey, string> {
  return {
    [TerritoryKindKey.Classical]: m.territories_type_classical(),
    [TerritoryKindKey.Commerces]: m.territories_type_commerces(),
    [TerritoryKindKey.Phone]: m.territories_type_phone(),
    [TerritoryKindKey.Hotel]: m.territories_type_hotel(),
    [TerritoryKindKey.Univ]: m.territories_type_university(),
  }
}
