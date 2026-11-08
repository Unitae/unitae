/** Which list the publishers page shows: the active roll (default), the inactive, or those who left. */
export const PUBLISHER_STATUSES = ['active', 'inactive', 'left'] as const
export type PublisherStatus = (typeof PUBLISHER_STATUSES)[number]

/** Appointments and ongoing pioneer service, shown as tags and filterable. */
export const PRIVILEGES = [
  'elder',
  'servant',
  'regular-pioneer',
  'auxiliary-pioneer',
  'special-pioneer',
  'missionary',
] as const
export type Privilege = (typeof PRIVILEGES)[number]

export interface PublisherListFilters {
  search: string
  groupIds: number[]
  privilege: Privilege | null
  status: PublisherStatus
}

const isOneOf = <T extends string>(values: readonly T[], value: string | null): value is T =>
  value != null && (values as readonly string[]).includes(value)

/** The list filters from the page URL; unknown values fall back to every active publisher. */
export function parsePublisherListParams(params: URLSearchParams): PublisherListFilters {
  const privilege = params.get('privilege')
  const status = params.get('status')
  return {
    search: params.get('q')?.trim() ?? '',
    groupIds: params
      .getAll('group')
      .map(Number)
      .filter(id => Number.isInteger(id) && id > 0),
    privilege: isOneOf(PRIVILEGES, privilege) ? privilege : null,
    status: isOneOf(PUBLISHER_STATUSES, status) ? status : 'active',
  }
}

/** Whether the list is narrowed: the status picks a list rather than narrowing one. */
export function hasNarrowingFilters(filters: PublisherListFilters): boolean {
  return filters.search !== '' || filters.groupIds.length > 0 || filters.privilege != null
}
