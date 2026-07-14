import { PublisherType } from '~/shared/types/publisher-type'

export type ActivityStatusFilter = 'all' | 'filed' | 'not-filed' | 'irregular' | 'inactive'
export type ActivityTypeFilter = 'all' | PublisherType

export interface ActivityFilters {
  query: string
  groupIds: number[]
  status: ActivityStatusFilter
  type: ActivityTypeFilter
}

export interface FilterablePublisher {
  id: number
  firstname: string
  lastname: string | null
  publisherGroup: { id: number; name: string } | null
  wasInactive: boolean
  notRegular: boolean
  lastActivity: { type: PublisherType } | null
}

const STATUS_VALUES: readonly ActivityStatusFilter[] = ['all', 'filed', 'not-filed', 'irregular', 'inactive'] as const
const PUBLISHER_TYPE_VALUES: readonly PublisherType[] = Object.values(PublisherType)

export function filterPublisherActivities<T extends FilterablePublisher>(
  publishers: T[],
  filters: ActivityFilters,
): T[] {
  const normalisedQuery = filters.query.trim().toLocaleLowerCase()
  const groupSet = filters.groupIds.length === 0 ? null : new Set(filters.groupIds)

  return publishers.filter(
    publisher =>
      matchesQuery(publisher, normalisedQuery) &&
      matchesGroups(publisher, groupSet) &&
      matchesStatus(publisher, filters.status) &&
      matchesType(publisher, filters.type),
  )
}

function matchesQuery(publisher: FilterablePublisher, normalisedQuery: string): boolean {
  if (normalisedQuery === '') return true
  const haystack = `${publisher.firstname} ${publisher.lastname ?? ''}`.toLocaleLowerCase()
  return haystack.includes(normalisedQuery)
}

function matchesGroups(publisher: FilterablePublisher, groupSet: Set<number> | null): boolean {
  if (groupSet === null) return true
  if (publisher.publisherGroup == null) return false
  return groupSet.has(publisher.publisherGroup.id)
}

function matchesStatus(publisher: FilterablePublisher, status: ActivityStatusFilter): boolean {
  switch (status) {
    case 'all':
      return true
    case 'inactive':
      return publisher.wasInactive
    case 'irregular':
      return !publisher.wasInactive && publisher.notRegular
    case 'not-filed':
      return !publisher.wasInactive && publisher.lastActivity == null
    case 'filed':
      return !publisher.wasInactive && !publisher.notRegular && publisher.lastActivity != null
  }
}

function matchesType(publisher: FilterablePublisher, type: ActivityTypeFilter): boolean {
  if (type === 'all') return true
  if (publisher.lastActivity == null) return false
  return publisher.lastActivity.type === type
}

export function readActivityFiltersFromParams(params: URLSearchParams): ActivityFilters {
  const groupIds = params
    .getAll('group')
    .map(raw => Number(raw))
    .filter(id => Number.isInteger(id))

  const statusRaw = params.get('status')
  const status: ActivityStatusFilter =
    statusRaw != null && (STATUS_VALUES as readonly string[]).includes(statusRaw)
      ? (statusRaw as ActivityStatusFilter)
      : 'all'

  const typeRaw = params.get('type')
  const type: ActivityTypeFilter =
    typeRaw != null && (PUBLISHER_TYPE_VALUES as readonly string[]).includes(typeRaw)
      ? (typeRaw as PublisherType)
      : 'all'

  return {
    query: params.get('q') ?? '',
    groupIds,
    status,
    type,
  }
}

export function activityFiltersAreEmpty(filters: ActivityFilters): boolean {
  return filters.query === '' && filters.groupIds.length === 0 && filters.status === 'all' && filters.type === 'all'
}

export const ACTIVITY_FILTER_PARAM_NAMES = ['q', 'group', 'status', 'type'] as const
