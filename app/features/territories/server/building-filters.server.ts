import type { Prisma } from '~/database/generated/client'
import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import type { ShopKind } from '~/features/territories/model/shop-kind.type'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { stripDiacritics } from '~/shared/utils/strip-diacritics'
import { addressRegex, proximityPrefix } from './address-regex'

/**
 * The prospection filters from the address (`zip`, `type`, `access`, `shops`, `position`, `search`). Each one is its
 * own condition, so two that look at the entrances (« Contient » and « Accès ») both hold.
 */
export function computeFilters(params: URLSearchParams): Prisma.BuildingWhereInput {
  const conditions = [
    zipFilter(params),
    typeFilter(params),
    accessFilter(params),
    shopFilter(params),
    positionFilter(params),
    searchFilter(params),
  ].filter((condition): condition is Prisma.BuildingWhereInput => condition != null)

  if (conditions.length === 0) return {}
  return conditions.length === 1 ? conditions[0] : { AND: conditions }
}

type Condition = Prisma.BuildingWhereInput | null

function chosen(params: URLSearchParams, name: string): string | null {
  const value = params.get(name)
  return value != null && value !== '' && value !== 'none' ? value : null
}

function zipFilter(params: URLSearchParams): Condition {
  const zip = chosen(params, 'zip')
  return zip == null ? null : { zip: { equals: zip } }
}

function shopFilter(params: URLSearchParams): Condition {
  const shop = chosen(params, 'shops') as ShopKind | null
  return shop == null ? null : { entrances: { some: { kind: EntranceKind.Commerce, shopKind: shop } } }
}

const ENTRANCES_BY_TYPE: Record<TerritoryKindKey, Prisma.BuildingEntranceWhereInput> = {
  [TerritoryKindKey.Classical]: { kind: EntranceKind.Residential, homes: { gt: 0 } },
  [TerritoryKindKey.Phone]: { kind: EntranceKind.Residential, phones: { gt: 0 } },
  [TerritoryKindKey.Commerces]: { kind: EntranceKind.Commerce },
  [TerritoryKindKey.Hotel]: { kind: EntranceKind.Hotel },
  [TerritoryKindKey.Univ]: { kind: EntranceKind.Campus },
}

function typeFilter(params: URLSearchParams): Condition {
  const type = chosen(params, 'type')
  const entrances = type == null ? undefined : ENTRANCES_BY_TYPE[type as TerritoryKindKey]
  return entrances == null ? null : { entrances: { some: entrances } }
}

function accessFilter(params: URLSearchParams): Condition {
  const access = chosen(params, 'access')
  return access == null ? null : { entrances: { some: { access: { equals: Number(access) } } } }
}

/** `position=none`: the buildings no map can show. */
function positionFilter(params: URLSearchParams): Condition {
  return params.get('position') === 'none' ? { OR: [{ latitude: null }, { longitude: null }] } : null
}

function searchFilter(params: URLSearchParams): Condition {
  const raw = params.get('search')
  const trimmed = raw?.replace(proximityPrefix, '').trim() ?? ''
  if (trimmed.length === 0) return null

  const normalized = stripDiacritics(trimmed)
  const addressTerms = trimmed.match(addressRegex)
  const addressNumber = addressTerms?.[1]
  const addressStreet = addressTerms?.[3]
  const addressStreetNormalized = addressStreet != null ? stripDiacritics(addressStreet) : null

  return {
    OR: [
      addressTerms == null
        ? { streetNormalized: { contains: normalized } }
        : {
            AND: [
              { number: { contains: addressNumber, mode: 'insensitive' } },
              { streetNormalized: { contains: addressStreetNormalized ?? normalized } },
            ],
          },
      { number: { contains: trimmed, mode: 'insensitive' } },
    ],
  }
}
