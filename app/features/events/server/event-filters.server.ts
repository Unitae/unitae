import type { Prisma } from '~/database/generated/client'

export function computeFilters(params: URLSearchParams): Prisma.EventWhereInput {
  let filters: Prisma.EventWhereInput = {}

  filters = applyDateFilter(filters, params)

  return filters
}

function applyDateFilter(filters: Prisma.EventWhereInput, params: URLSearchParams): Prisma.EventWhereInput {
  if (params.has('date') && params.get('date') !== 'none') {
    const date = new Date(String(params.get('date')))

    return {
      ...filters,

      startDate: {
        lte: date,
      },
      endDate: {
        gte: date,
      },
    }
  }

  return {
    ...filters,

    startDate: {
      lte: new Date(),
    },
    endDate: {
      gte: new Date(),
    },
  }
}
