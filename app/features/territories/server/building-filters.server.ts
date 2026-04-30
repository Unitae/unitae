import type { Prisma } from '~/database/generated/client'
import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import type { ShopKind } from '~/features/territories/model/shop-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'

const addressRegex = /^(\d+\s*(bis|ter|quarter)?)\s+(.+)$/

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
    const type = params.get('type') as TerritoryKind

    if (type === TerritoryKind.Classical) {
      return { ...filters, entrances: { some: { kind: EntranceKind.Residential, homes: { gt: 0 } } } }
    }

    if (type === TerritoryKind.Phone) {
      return { ...filters, entrances: { some: { kind: EntranceKind.Residential, phones: { gt: 0 } } } }
    }

    if (type === TerritoryKind.Commerces) {
      return { ...filters, entrances: { some: { kind: EntranceKind.Commerce } } }
    }

    if (type === TerritoryKind.Hotel) {
      return { ...filters, entrances: { some: { kind: EntranceKind.Hotel } } }
    }

    if (type === TerritoryKind.Univ) {
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
  if (params.has('search') && (params.get('search')?.length ?? 0) > 0) {
    const searchTerms = params.get('search') ?? ''
    const addressTerms = searchTerms.match(addressRegex)

    return {
      ...filters,
      // biome-ignore lint/style/useNamingConvention: prisma default naming convention
      OR: [
        addressTerms == null
          ? { street: { contains: searchTerms } }
          : // biome-ignore lint/style/useNamingConvention: prisma default naming convention
            { AND: [{ number: { contains: addressTerms?.[1] } }, { street: { contains: addressTerms?.[3] } }] },
      ],
    }
  }
  return filters
}
