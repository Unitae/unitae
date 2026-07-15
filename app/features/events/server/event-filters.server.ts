import type { Prisma } from '~/database/generated/client'

export function getDefaultDateRange(): { from: Date; to: Date } {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const nextMonth = now.getMonth() + 2
  const nextMonthYear = now.getFullYear() + Math.floor(nextMonth / 12)
  const to = new Date(nextMonthYear, nextMonth % 12, 0) // Last day of next month

  return { from, to }
}

export function computeFilters(params: URLSearchParams): Prisma.EventWhereInput {
  let filters: Prisma.EventWhereInput = {}

  filters = applyDateRangeFilter(filters, params)
  filters = applyPublisherFilter(filters, params)
  filters = applyHasConflictsFilter(filters, params)

  return filters
}

function applyDateRangeFilter(filters: Prisma.EventWhereInput, params: URLSearchParams): Prisma.EventWhereInput {
  const fromParam = params.get('from')
  const toParam = params.get('to')

  const defaults = getDefaultDateRange()

  const from = fromParam && fromParam !== 'none' ? new Date(fromParam) : defaults.from
  const to = toParam && toParam !== 'none' ? new Date(toParam) : defaults.to

  return {
    ...filters,
    startDate: { lte: to },
    endDate: { gte: from },
  }
}

function applyPublisherFilter(filters: Prisma.EventWhereInput, params: URLSearchParams): Prisma.EventWhereInput {
  const publisher = params.get('publisher')

  if (publisher && publisher !== 'none') {
    return {
      ...filters,
      createdById: Number(publisher),
    }
  }

  return filters
}

// `?hasConflicts=true` restricts the list to events that have at least one
// assignment flagged as a day-off conflict. Powers the deep-link from the
// responsible-conflict dashboard card.
function applyHasConflictsFilter(filters: Prisma.EventWhereInput, params: URLSearchParams): Prisma.EventWhereInput {
  if (params.get('hasConflicts') !== 'true') {
    return filters
  }

  return {
    ...filters,
    OR: [
      { partAssignments: { some: { hasConflict: true } } },
      { serviceRoleAssignments: { some: { hasConflict: true } } },
    ],
  }
}
