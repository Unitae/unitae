import type { Prisma } from '~/database/generated/client'
import { EventStatus } from '~/features/events/model/event-status.type'

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
  filters = applyStatusFilter(filters, params)

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

// Plumbing for a future "Brouillons" / "Publiés" toggle on the events list.
// Only recognises the two valid statuses so a bad querystring value doesn't
// silently return zero rows.
function applyStatusFilter(filters: Prisma.EventWhereInput, params: URLSearchParams): Prisma.EventWhereInput {
  const status = params.get('status')
  if (status !== EventStatus.Draft && status !== EventStatus.Released) return filters
  return { ...filters, status }
}

// `?hasConflicts=true` restricts the list to events that have at least one
// assignment flagged as a day-off conflict. Nested under `AND` so a
// caller (or a future filter) can freely set its own top-level `OR`
// without either clause silently overwriting the other.
function applyHasConflictsFilter(filters: Prisma.EventWhereInput, params: URLSearchParams): Prisma.EventWhereInput {
  if (params.get('hasConflicts') !== 'true') {
    return filters
  }

  const existingAnd = Array.isArray(filters.AND) ? filters.AND : filters.AND ? [filters.AND] : []
  return {
    ...filters,
    AND: [
      ...existingAnd,
      {
        OR: [{ eventParts: { some: { hasConflict: true } } }, { eventServiceRoles: { some: { hasConflict: true } } }],
      },
    ],
  }
}
