import { describe, expect, it } from 'vitest'

import { hasNarrowingFilters, parsePublisherListParams } from './publisher-list-filters'

describe('parsePublisherListParams', () => {
  it('reads the search, the groups, the privilege and the status', () => {
    const filters = parsePublisherListParams(
      new URLSearchParams('q=%20Mar%20&group=2&group=5&group=x&privilege=elder&status=inactive'),
    )
    expect(filters).toEqual({ search: 'Mar', groupIds: [2, 5], privilege: 'elder', status: 'inactive' })
  })

  it('falls back to every active publisher on unknown or missing values', () => {
    expect(parsePublisherListParams(new URLSearchParams('privilege=bishop&status=gone'))).toEqual({
      search: '',
      groupIds: [],
      privilege: null,
      status: 'active',
    })
  })
})

describe('hasNarrowingFilters', () => {
  it('ignores the status, which picks a list rather than narrowing it', () => {
    expect(hasNarrowingFilters({ search: '', groupIds: [], privilege: null, status: 'left' })).toBe(false)
    expect(hasNarrowingFilters({ search: '', groupIds: [3], privilege: null, status: 'active' })).toBe(true)
  })
})
