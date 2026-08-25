import type { Prisma } from '~/database/generated/client'
import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import type { ShopKind } from '~/features/territories/model/shop-kind.type'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { stripDiacritics } from '~/shared/utils/strip-diacritics'
import { addressRegex, proximityPrefix } from './address-regex'

export function computeFilters(params: URLSearchParams): Prisma.BuildingWhereInput {
  let filters: Prisma.BuildingWhereInput = {}

  filters = applyZipFilter(filters, params)
  filters = applyTypeFilter(filters, params)
  filters = applyAccessFilter(filters, params)
  filters = applyShopFilter(filters, params)
  filters = applySearchFilter(filters, params)

  return filters
}

function applyZipFilter(filters: Prisma.BuildingWhereInput, params: URLSearchParams): Prisma.BuildingWhereInput {
  if (params.has('zip') && params.get('zip') !== 'none') {
    return {
      ...filters,
      zip: {
        ...(typeof filters.zip !== 'string' ? filters.zip : {}),
        equals: params.get('zip')?.toString(),
      },
    }
  }
  return filters
}

function applyShopFilter(filters: Prisma.BuildingWhereInput, params: URLSearchParams): Prisma.BuildingWhereInput {
  if (params.has('shops') && params.get('shops') !== 'none') {
    const type = params.get('shops') as ShopKind

    return { ...filters, entrances: { some: { kind: EntranceKind.Commerce, shopKind: type } } }
  }

  return filters
}

function applyTypeFilter(filters: Prisma.BuildingWhereInput, params: URLSearchParams): Prisma.BuildingWhereInput {
  if (params.has('type') && params.get('type') !== 'none') {
    const type = params.get('type') as TerritoryKindKey

    if (type === TerritoryKindKey.Classical) {
      return { ...filters, entrances: { some: { kind: EntranceKind.Residential, homes: { gt: 0 } } } }
    }

    if (type === TerritoryKindKey.Phone) {
      return { ...filters, entrances: { some: { kind: EntranceKind.Residential, phones: { gt: 0 } } } }
    }

    if (type === TerritoryKindKey.Commerces) {
      return { ...filters, entrances: { some: { kind: EntranceKind.Commerce } } }
    }

    if (type === TerritoryKindKey.Hotel) {
      return { ...filters, entrances: { some: { kind: EntranceKind.Hotel } } }
    }

    if (type === TerritoryKindKey.Univ) {
      return { ...filters, entrances: { some: { kind: EntranceKind.Campus } } }
    }
  }
  return filters
}

function applyAccessFilter(filters: Prisma.BuildingWhereInput, params: URLSearchParams): Prisma.BuildingWhereInput {
  if (params.has('access') && params.get('access') !== 'none') {
    return {
      ...filters,
      entrances: {
        some: {
          access: {
            equals: Number(params.get('access')),
          },
        },
      },
    }
  }
  return filters
}

function applySearchFilter(filters: Prisma.BuildingWhereInput, params: URLSearchParams): Prisma.BuildingWhereInput {
  const raw = params.get('search')
  const trimmed = raw?.replace(proximityPrefix, '').trim() ?? ''
  if (trimmed.length === 0) return filters

  const normalized = stripDiacritics(trimmed)
  const addressTerms = trimmed.match(addressRegex)
  const addressNumber = addressTerms?.[1]
  const addressStreet = addressTerms?.[3]
  const addressStreetNormalized = addressStreet != null ? stripDiacritics(addressStreet) : null

  return {
    ...filters,
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
