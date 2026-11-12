import { describe, expect, it } from 'vitest'

import { hasNarrowingFilters, parsePublisherListParams } from './publisher-list-filters'

describe('parsePublisherListParams', () => {
  it('reads the search, the groups, the privilege and the status', () => {
    const filters = parsePublisherListParams(
      new URLSearchParams('q=%20Mar%20&group=2&group=5&group=x&privilege=elder&status=inactive'),
    )
    expect(filters).toEqual({
      search: 'Mar',
      groupIds: [2, 5],
      noGroup: false,
      privilege: 'elder',
      status: 'inactive',
      sort: 'name',
    })
  })

  // The groups list's banner links to the publishers in no group.
  it('reads « Sans groupe » beside the groups', () => {
    expect(parsePublisherListParams(new URLSearchParams('group=none'))).toMatchObject({ groupIds: [], noGroup: true })
    expect(parsePublisherListParams(new URLSearchParams('group=3&group=none'))).toMatchObject({
      groupIds: [3],
      noGroup: true,
    })
  })

  it('falls back to every active publisher on unknown or missing values', () => {
    expect(parsePublisherListParams(new URLSearchParams('privilege=bishop&status=gone'))).toEqual({
      search: '',
      groupIds: [],
      noGroup: false,
      privilege: null,
      status: 'active',
      sort: 'name',
    })
  })

  it('reads the order: by name or by group, and for those who left by departure (the default) or by name', () => {
    expect(parsePublisherListParams(new URLSearchParams('sort=group')).sort).toBe('group')
    expect(parsePublisherListParams(new URLSearchParams('status=left')).sort).toBe('departure')
    expect(parsePublisherListParams(new URLSearchParams('status=left&sort=name')).sort).toBe('name')
    expect(parsePublisherListParams(new URLSearchParams('status=left&sort=group')).sort).toBe('departure')
    expect(parsePublisherListParams(new URLSearchParams('sort=departure')).sort).toBe('name')
  })
})

describe('hasNarrowingFilters', () => {
  it('ignores the status, which picks a list rather than narrowing it', () => {
    const none = { search: '', groupIds: [], noGroup: false, privilege: null }
    expect(hasNarrowingFilters({ ...none, status: 'left' })).toBe(false)
    expect(hasNarrowingFilters({ ...none, groupIds: [3], status: 'active' })).toBe(true)
    expect(hasNarrowingFilters({ ...none, noGroup: true, status: 'active' })).toBe(true)
  })
})
