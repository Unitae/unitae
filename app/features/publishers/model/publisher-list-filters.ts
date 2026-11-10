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
  /** « Sans groupe » (`group=none`): those in no group, beside the groups chosen. */
  noGroup: boolean
  privilege: Privilege | null
  status: PublisherStatus
}

/** The `group` value that stands for « Sans groupe ». */
export const NO_GROUP_PARAM = 'none'

const isOneOf = <T extends string>(values: readonly T[], value: string | null): value is T =>
  value != null && (values as readonly string[]).includes(value)

/** The list filters from the page URL; unknown values fall back to every active publisher. */
export function parsePublisherListParams(params: URLSearchParams): PublisherListFilters {
  const privilege = params.get('privilege')
  const status = params.get('status')
  const groups = params.getAll('group')
  return {
    search: params.get('q')?.trim() ?? '',
    groupIds: groups.map(Number).filter(id => Number.isInteger(id) && id > 0),
    noGroup: groups.includes(NO_GROUP_PARAM),
    privilege: isOneOf(PRIVILEGES, privilege) ? privilege : null,
    status: isOneOf(PUBLISHER_STATUSES, status) ? status : 'active',
  }
}

/** Whether the list is narrowed: the status picks a list rather than narrowing one. */
export function hasNarrowingFilters(filters: PublisherListFilters): boolean {
  return filters.search !== '' || filters.groupIds.length > 0 || filters.noGroup || filters.privilege != null
}
