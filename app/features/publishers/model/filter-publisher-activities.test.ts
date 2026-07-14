import { describe, expect, it } from 'vitest'
import { PublisherType } from '~/shared/types/publisher-type'
import {
  type ActivityFilters,
  type FilterablePublisher,
  filterPublisherActivities,
  readActivityFiltersFromParams,
} from './filter-publisher-activities'

function make(overrides: Partial<FilterablePublisher> & { id: number }): FilterablePublisher {
  return {
    id: overrides.id,
    firstname: overrides.firstname ?? 'Jean',
    lastname: 'lastname' in overrides ? (overrides.lastname ?? null) : 'Dupont',
    publisherGroup: 'publisherGroup' in overrides ? (overrides.publisherGroup ?? null) : null,
    wasInactive: overrides.wasInactive ?? false,
    notRegular: overrides.notRegular ?? false,
    lastActivity: 'lastActivity' in overrides ? (overrides.lastActivity ?? null) : { type: PublisherType.Normal },
  }
}

const emptyFilters: ActivityFilters = { query: '', groupIds: [], status: 'all', type: 'all' }

describe('filterPublisherActivities', () => {
  it('returns every publisher when no filter is active', () => {
    const publishers = [make({ id: 1 }), make({ id: 2 }), make({ id: 3 })]
    expect(filterPublisherActivities(publishers, emptyFilters).map(p => p.id)).toEqual([1, 2, 3])
  })

  describe('name search', () => {
    it('matches on firstname case-insensitively', () => {
      const publishers = [
        make({ id: 11, firstname: 'Alice', lastname: 'Martin' }),
        make({ id: 12, firstname: 'Bob', lastname: 'Durand' }),
      ]
      const result = filterPublisherActivities(publishers, { ...emptyFilters, query: 'ali' })
      expect(result.map(p => p.id)).toEqual([11])
    })

    it('matches on lastname case-insensitively', () => {
      const publishers = [
        make({ id: 21, firstname: 'Alice', lastname: 'Martin' }),
        make({ id: 22, firstname: 'Bob', lastname: 'Durand' }),
      ]
      const result = filterPublisherActivities(publishers, { ...emptyFilters, query: 'DUR' })
      expect(result.map(p => p.id)).toEqual([22])
    })

    it('matches across the combined "firstname lastname"', () => {
      const publishers = [make({ id: 31, firstname: 'Marie', lastname: 'Curie' })]
      const result = filterPublisherActivities(publishers, { ...emptyFilters, query: 'marie cur' })
      expect(result.map(p => p.id)).toEqual([31])
    })

    it('handles null lastname without crashing', () => {
      const publishers = [make({ id: 41, firstname: 'Prince', lastname: null })]
      const result = filterPublisherActivities(publishers, { ...emptyFilters, query: 'PRINCE' })
      expect(result.map(p => p.id)).toEqual([41])
    })
  })

  describe('publisher group', () => {
    it('returns all publishers when groupIds is empty', () => {
      const publishers = [
        make({ id: 51, publisherGroup: { id: 100, name: 'G1' } }),
        make({ id: 52, publisherGroup: null }),
      ]
      expect(filterPublisherActivities(publishers, emptyFilters).map(p => p.id)).toEqual([51, 52])
    })

    it('keeps only publishers in one of the selected groups', () => {
      const publishers = [
        make({ id: 61, publisherGroup: { id: 100, name: 'G1' } }),
        make({ id: 62, publisherGroup: { id: 200, name: 'G2' } }),
        make({ id: 63, publisherGroup: { id: 300, name: 'G3' } }),
        make({ id: 64, publisherGroup: null }),
      ]
      const result = filterPublisherActivities(publishers, { ...emptyFilters, groupIds: [100, 300] })
      expect(result.map(p => p.id)).toEqual([61, 63])
    })

    it('excludes publishers without a group when a group is selected', () => {
      const publishers = [
        make({ id: 71, publisherGroup: { id: 100, name: 'G1' } }),
        make({ id: 72, publisherGroup: null }),
      ]
      const result = filterPublisherActivities(publishers, { ...emptyFilters, groupIds: [100] })
      expect(result.map(p => p.id)).toEqual([71])
    })
  })

  describe('status', () => {
    const publishers = [
      make({ id: 81, wasInactive: true, notRegular: false, lastActivity: null }),
      make({
        id: 82,
        wasInactive: false,
        notRegular: true,
        lastActivity: { type: PublisherType.Normal },
      }),
      make({ id: 83, wasInactive: false, notRegular: false, lastActivity: null }),
      make({
        id: 84,
        wasInactive: false,
        notRegular: false,
        lastActivity: { type: PublisherType.Normal },
      }),
      make({
        id: 85,
        wasInactive: true,
        notRegular: false,
        lastActivity: { type: PublisherType.Normal },
      }),
    ]

    it('inactive keeps only wasInactive rows', () => {
      const result = filterPublisherActivities(publishers, { ...emptyFilters, status: 'inactive' })
      expect(result.map(p => p.id)).toEqual([81, 85])
    })

    it('irregular keeps only notRegular rows (excluding inactive)', () => {
      const result = filterPublisherActivities(publishers, { ...emptyFilters, status: 'irregular' })
      expect(result.map(p => p.id)).toEqual([82])
    })

    it('not-filed keeps only rows with no lastActivity and not inactive', () => {
      const result = filterPublisherActivities(publishers, { ...emptyFilters, status: 'not-filed' })
      expect(result.map(p => p.id)).toEqual([83])
    })

    it('filed keeps only rows with a regular lastActivity and not inactive', () => {
      const result = filterPublisherActivities(publishers, { ...emptyFilters, status: 'filed' })
      expect(result.map(p => p.id)).toEqual([84])
    })
  })

  describe('type', () => {
    const publishers = [
      make({ id: 91, lastActivity: { type: PublisherType.Normal } }),
      make({ id: 92, lastActivity: { type: PublisherType.PionnierAuxiliaires } }),
      make({ id: 93, lastActivity: { type: PublisherType.PionnierPermanant } }),
      make({ id: 94, lastActivity: null }),
    ]

    it('filters by pioneer type', () => {
      const result = filterPublisherActivities(publishers, {
        ...emptyFilters,
        type: PublisherType.PionnierAuxiliaires,
      })
      expect(result.map(p => p.id)).toEqual([92])
    })

    it('excludes publishers without a lastActivity when a type is selected', () => {
      const result = filterPublisherActivities(publishers, { ...emptyFilters, type: PublisherType.Normal })
      expect(result.map(p => p.id)).toEqual([91])
    })
  })

  it('combines all filters with AND semantics', () => {
    const publishers = [
      make({
        id: 101,
        firstname: 'Alice',
        publisherGroup: { id: 100, name: 'G1' },
        lastActivity: { type: PublisherType.Normal },
      }),
      make({
        id: 102,
        firstname: 'Alice',
        publisherGroup: { id: 200, name: 'G2' },
        lastActivity: { type: PublisherType.Normal },
      }),
      make({
        id: 103,
        firstname: 'Bob',
        publisherGroup: { id: 100, name: 'G1' },
        lastActivity: { type: PublisherType.Normal },
      }),
    ]
    const result = filterPublisherActivities(publishers, {
      query: 'alice',
      groupIds: [100],
      status: 'filed',
      type: PublisherType.Normal,
    })
    expect(result.map(p => p.id)).toEqual([101])
  })
})

describe('readActivityFiltersFromParams', () => {
  it('returns empty defaults when no params are set', () => {
    expect(readActivityFiltersFromParams(new URLSearchParams())).toEqual({
      query: '',
      groupIds: [],
      status: 'all',
      type: 'all',
    })
  })

  it('reads the query from ?q=', () => {
    expect(readActivityFiltersFromParams(new URLSearchParams('q=alice')).query).toBe('alice')
  })

  it('reads multiple group ids from repeated ?group=', () => {
    expect(readActivityFiltersFromParams(new URLSearchParams('group=1&group=2')).groupIds).toEqual([1, 2])
  })

  it('ignores non-numeric group values', () => {
    expect(readActivityFiltersFromParams(new URLSearchParams('group=nope&group=3')).groupIds).toEqual([3])
  })

  it('reads a valid status value', () => {
    expect(readActivityFiltersFromParams(new URLSearchParams('status=inactive')).status).toBe('inactive')
  })

  it('falls back to "all" when status is invalid', () => {
    expect(readActivityFiltersFromParams(new URLSearchParams('status=bogus')).status).toBe('all')
  })

  it('reads a valid publisher type', () => {
    expect(readActivityFiltersFromParams(new URLSearchParams(`type=${PublisherType.PionnierAuxiliaires}`)).type).toBe(
      PublisherType.PionnierAuxiliaires,
    )
  })

  it('falls back to "all" when type is invalid', () => {
    expect(readActivityFiltersFromParams(new URLSearchParams('type=bogus')).type).toBe('all')
  })
})
