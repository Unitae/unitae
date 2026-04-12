import type { Prisma } from '~/database/generated/client'
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

    return { ...filters, hasShops: true, shopKind: type }
  }

  return filters
}

function applyTypeFilter(filters: Prisma.BuildingWhereInput, params: URLSearchParams): Prisma.BuildingWhereInput {
  if (params.has('type') && params.get('type') !== 'none') {
    const type = params.get('type') as TerritoryKind

    if (type === TerritoryKind.Classical) {
      return { ...filters, homes: { gt: 0 } }
    }

    if (type === TerritoryKind.Phone) {
      return { ...filters, phones: { gt: 0 } }
    }

    if (type === TerritoryKind.Commerces) {
      return { ...filters, hasShops: { equals: true } }
    }

    if (type === TerritoryKind.Hotel) {
      return { ...filters, hasHotel: { equals: true } }
    }

    if (type === TerritoryKind.Univ) {
      return { ...filters, hasCampus: { equals: true } }
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
