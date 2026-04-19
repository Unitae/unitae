import type { Prisma } from '~/database/generated/client'
import type { TerritoryKind } from '~/features/territories/model/territory-kind.type'

const addressRegex = /^(\d+\s*(bis|ter|quarter)?)\s+(.+)$/

export function computeFilters(params: URLSearchParams): Prisma.TerritoryWhereInput {
  let filters: Prisma.TerritoryWhereInput = {}

  filters = applyZipFilter(filters, params)
  filters = applyTypeFilter(filters, params)
  filters = applyAccessFilter(filters, params)
  filters = applySearchFilter(filters, params)

  return filters
}

function applyZipFilter(filters: Prisma.TerritoryWhereInput, params: URLSearchParams): Prisma.TerritoryWhereInput {
  if (params.has('zip') && params.get('zip') !== 'none') {
    return {
      ...filters,
      entrances: {
        some: {
          buildings: {
            ...(filters.entrances?.some?.buildings ?? {}),
            some: {
              ...(filters.entrances?.some?.buildings?.some ?? {}),
              zip: { equals: params.get('zip')?.toString() },
            },
          },
        },
      },
    }
  }

  return filters
}

function applyTypeFilter(filters: Prisma.TerritoryWhereInput, params: URLSearchParams): Prisma.TerritoryWhereInput {
  if (params.has('type') && params.get('type') !== 'none') {
    return {
      ...filters,
      type: {
        ...(typeof filters.type !== 'string' ? filters.type : {}),
        equals: params.get('type') as TerritoryKind,
      },
    }
  }

  return filters
}

function applyAccessFilter(filters: Prisma.TerritoryWhereInput, params: URLSearchParams): Prisma.TerritoryWhereInput {
  if (params.has('access') && params.get('access') !== 'none') {
    return {
      ...filters,
      entrances: {
        some: {
          ...(filters.entrances?.some ?? {}),
          access: { equals: Number(params.get('access')) },
        },
      },
    }
  }

  return filters
}

function applySearchFilter(filters: Prisma.TerritoryWhereInput, params: URLSearchParams): Prisma.TerritoryWhereInput {
  if (params.has('search') && (params.get('search')?.length ?? 0) > 0) {
    const searchTerms = params.get('search') ?? ''
    const addressTerms = searchTerms.match(addressRegex)

    return {
      ...filters,
      // biome-ignore lint/style/useNamingConvention: prisma default naming convention
      OR: [
        ...(filters.OR ?? []),
        {
          entrances: {
            some: {
              buildings: {
                some: {
                  // biome-ignore lint/style/useNamingConvention: prisma default naming convention
                  OR: [
                    addressTerms == null
                      ? { street: { contains: searchTerms } }
                      : {
                          // biome-ignore lint/style/useNamingConvention: prisma default naming convention
                          AND: [
                            { number: { contains: addressTerms?.[1] } },
                            { street: { contains: addressTerms?.[3] } },
                          ],
                        },
                  ],
                },
              },
            },
          },
        },
        {
          number: { contains: searchTerms },
        },
      ],
    }
  }

  return filters
}
