import { ShopKind } from '~/features/territories/model/shop-kind.type'
import { TerritoryAccess } from '~/features/territories/model/territory-access.type'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import * as m from '~/i18n/paraglide/messages'
import type { FilterChip } from '~/shared/ui/filters/FilterChipBar'
import { formatGroupName } from '~/shared/utils/format-group-name'

// URL query parameter a chip's X clears. Constrained to the parameters the
// filter forms actually parse so a typo (`'zipcode'`) can't silently produce
// a chip whose X clears nothing.
export type TerritoryFilterKey = 'search' | 'zip' | 'type' | 'access' | 'shops' | 'group' | 'status'

export interface ActiveTerritoryFilterChip extends FilterChip {
  key: TerritoryFilterKey
}

interface BuildChipsOptions {
  // Map of publisherGroupId → display name, supplied by pages showing the
  // group filter (attribution list, prospection). Empty for pages that don't
  // expose group.
  groups?: Array<{ id: number; name: string }>
}

function typeChipValue(raw: string): string | null {
  switch (raw) {
    case TerritoryKind.Classical:
      return m.territories_type_classical_capitalized()
    case TerritoryKind.Commerces:
      return m.territories_type_commerces()
    case TerritoryKind.Phone:
      return m.territories_type_phone()
    case TerritoryKind.Hotel:
      return m.territories_type_hotel()
    case TerritoryKind.Univ:
      return m.territories_type_university_singular()
    default:
      return null
  }
}

function attributionTypeChipValue(raw: string): string | null {
  switch (raw) {
    case TerritoryAttributionKind.Default:
      return m.attributions_type_default()
    case TerritoryAttributionKind.Phone:
      return m.attributions_type_phone()
    case TerritoryAttributionKind.Campaign:
      return m.attributions_type_campaign()
    default:
      return null
  }
}

function accessChipValue(raw: string): string | null {
  switch (Number(raw)) {
    case TerritoryAccess.Code:
      return m.territories_filter_access_digicode()
    case TerritoryAccess.Doorbell:
      return m.territories_filter_access_doorbell()
    case TerritoryAccess.Intercom:
      return m.territories_filter_access_intercom()
    default:
      return null
  }
}

function shopChipValue(raw: string): string | null {
  switch (raw) {
    case ShopKind.Food:
      return m.shop_kind_food()
    case ShopKind.Clothing:
      return m.shop_kind_clothing()
    case ShopKind.Jewelry:
      return m.shop_kind_jewelry()
    case ShopKind.Health:
      return m.shop_kind_health()
    case ShopKind.Home:
      return m.shop_kind_home()
    case ShopKind.Catering:
      return m.shop_kind_catering()
    case ShopKind.Cosmetics:
      return m.shop_kind_cosmetics()
    case ShopKind.Tech:
      return m.shop_kind_tech()
    case ShopKind.Newspaper:
      return m.shop_kind_newspaper()
    case ShopKind.GasStation:
      return m.shop_kind_gas_station()
    case ShopKind.Other:
      return m.shop_kind_other()
    default:
      return null
  }
}

function attributionStatusChipValue(raw: string): string | null {
  switch (raw) {
    case 'current':
      return m.territories_filter_status_current()
    case 'late':
      return m.territories_filter_status_late()
    case 'orphaned':
      return m.territories_filter_status_orphaned()
    default:
      return null
  }
}

function searchChipValue(raw: string): string {
  return raw.trim()
}

function appendChip(
  chips: ActiveTerritoryFilterChip[],
  params: URLSearchParams,
  key: TerritoryFilterKey,
  label: string,
  display: (raw: string) => string | null,
) {
  const raw = params.get(key)
  if (raw == null || raw === '' || raw === 'none') return
  const value = display(raw)
  if (value == null || value.length === 0) return
  chips.push({ key, label, value })
}

/**
 * Build the chip list for a page using `TerritoryFilters`: territory list,
 * available-territories picker, prospection, split-tool. Each chip's `key`
 * mirrors the URL query param name so the chip's X can drop just that one.
 */
export function buildTerritoryFilterChips(params: URLSearchParams): ActiveTerritoryFilterChip[] {
  const chips: ActiveTerritoryFilterChip[] = []
  appendChip(chips, params, 'search', m.territories_filter_chip_search(), searchChipValue)
  appendChip(chips, params, 'zip', m.territories_filter_chip_zip(), raw => raw)
  appendChip(chips, params, 'type', m.territories_filter_chip_type(), typeChipValue)
  appendChip(chips, params, 'access', m.territories_filter_chip_access(), accessChipValue)
  appendChip(chips, params, 'shops', m.territories_filter_chip_shops(), shopChipValue)
  return chips
}

/**
 * Build the chip list for `/territories/attributions` (AttributionFilters).
 * `groups` resolves the publisher-group id back to its display name.
 */
export function buildAttributionFilterChips(
  params: URLSearchParams,
  options: BuildChipsOptions = {},
): ActiveTerritoryFilterChip[] {
  const chips: ActiveTerritoryFilterChip[] = []
  appendChip(chips, params, 'search', m.territories_filter_chip_search(), searchChipValue)
  appendChip(chips, params, 'type', m.territories_filter_chip_mode(), attributionTypeChipValue)
  appendChip(chips, params, 'group', m.territories_filter_chip_group(), raw => {
    const group = options.groups?.find(g => g.id === Number(raw))
    return group ? formatGroupName(group.name) : null
  })
  appendChip(chips, params, 'status', m.territories_filter_chip_status(), attributionStatusChipValue)
  return chips
}
