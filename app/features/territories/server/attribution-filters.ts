import type { Prisma } from '~/database/generated/client'
import type { TerritoryKind } from '~/features/territories/model/territory-kind.type'

export function computeFilters(params: URLSearchParams): Prisma.AttributionWhereInput {
  let filters: Prisma.AttributionWhereInput = {}

  filters = applyGroupFilter(filters, params)
  filters = applyTypeFilter(filters, params)
  filters = applyStatusFilter(filters, params)
  filters = applySearchFilter(filters, params)

  return filters
}

function applyGroupFilter(
  filters: Prisma.AttributionWhereInput,
  params: URLSearchParams,
): Prisma.AttributionWhereInput {
  if (params.has('group') && params.get('group') !== 'none') {
    return {
      ...filters,
      publisher: {
        publisherGroupId: { equals: Number(params.get('group')) },
      },
    }
  }

  return filters
}

function applyTypeFilter(filters: Prisma.AttributionWhereInput, params: URLSearchParams): Prisma.AttributionWhereInput {
  if (params.has('type') && params.get('type') !== 'none') {
    return { ...filters, type: { equals: params.get('type') as TerritoryKind } }
  }

  return filters
}

function applyStatusFilter(
  filters: Prisma.AttributionWhereInput,
  params: URLSearchParams,
): Prisma.AttributionWhereInput {
  if (params.has('status') && params.get('status') !== 'none') {
    if (params.get('status') === 'late') {
      return { ...filters, lateDate: { lt: new Date() } }
    }

    return { ...filters, lateDate: { gt: new Date() } }
  }

  return filters
}

function applySearchFilter(
  filters: Prisma.AttributionWhereInput,
  params: URLSearchParams,
): Prisma.AttributionWhereInput {
  if (params.has('search') && (params.get('search')?.length ?? 0) > 0) {
    const searchTerms = params.get('search') ?? ''
    return {
      ...filters,
      // biome-ignore lint/style/useNamingConvention: prisma syntax
      OR: [
        {
          publisher: {
            // biome-ignore lint/style/useNamingConvention: prisma syntax
            OR: [
              {
                firstname: { contains: searchTerms },
              },
              {
                lastname: { contains: searchTerms },
              },
            ],
          },
        },
        {
          territory: { number: { contains: searchTerms } },
        },
      ],
    }
  }

  return filters
}
