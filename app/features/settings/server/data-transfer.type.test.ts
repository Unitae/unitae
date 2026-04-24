import { describe, expect, it } from 'vitest'
import { ARCHIVE_VERSION, ENTITY_FILES, EntityIdMap } from './data-transfer.type'

describe('EntityIdMap', () => {
  it('stores and retrieves a mapped ID', () => {
    const map = new EntityIdMap()
    map.set('users', 10, 42)

    expect(map.get('users', 10)).toBe(42)
  })

  it('stores IDs for different entity types independently', () => {
    const map = new EntityIdMap()
    map.set('users', 1, 100)
    map.set('territories', 1, 200)

    expect(map.get('users', 1)).toBe(100)
    expect(map.get('territories', 1)).toBe(200)
  })

  it('throws when getting a missing ID', () => {
    const map = new EntityIdMap()

    expect(() => map.get('users', 999)).toThrow('Missing ID mapping for users#999')
  })

  it('throws when getting from an unknown entity type', () => {
    const map = new EntityIdMap()
    map.set('users', 1, 10)

    expect(() => map.get('territories', 1)).toThrow('Missing ID mapping for territories#1')
  })

  it('overwrites a previous mapping for the same entity and old ID', () => {
    const map = new EntityIdMap()
    map.set('users', 5, 50)
    map.set('users', 5, 99)

    expect(map.get('users', 5)).toBe(99)
  })

  describe('getOptional', () => {
    it('returns the mapped ID when it exists', () => {
      const map = new EntityIdMap()
      map.set('users', 10, 42)

      expect(map.getOptional('users', 10)).toBe(42)
    })

    it('returns null for a missing ID', () => {
      const map = new EntityIdMap()

      expect(map.getOptional('users', 999)).toBeNull()
    })

    it('returns null for null input', () => {
      const map = new EntityIdMap()
      map.set('users', 1, 10)

      expect(map.getOptional('users', null)).toBeNull()
    })

    it('returns null for undefined input', () => {
      const map = new EntityIdMap()

      expect(map.getOptional('users', undefined)).toBeNull()
    })

    it('returns null for an unknown entity type', () => {
      const map = new EntityIdMap()

      expect(map.getOptional('unknown', 1)).toBeNull()
    })
  })
})

describe('ARCHIVE_VERSION', () => {
  it('is a non-empty string', () => {
    expect(ARCHIVE_VERSION).toBe('1.0')
  })
})

describe('ENTITY_FILES', () => {
  it('contains the expected entity types in dependency order', () => {
    expect(ENTITY_FILES[0]).toBe('congregation')
    expect(ENTITY_FILES).toContain('users')
    expect(ENTITY_FILES).toContain('territories')
    expect(ENTITY_FILES).toContain('board-documents')
  })

  it('has users before publisher-groups (dependency order)', () => {
    const usersIndex = ENTITY_FILES.indexOf('users')
    const groupsIndex = ENTITY_FILES.indexOf('publisher-groups')

    expect(usersIndex).toBeLessThan(groupsIndex)
  })

  it('has territories before attributions (dependency order)', () => {
    const territoriesIndex = ENTITY_FILES.indexOf('territories')
    const attributionsIndex = ENTITY_FILES.indexOf('attributions')

    expect(territoriesIndex).toBeLessThan(attributionsIndex)
  })

  it('has board-sections before board-documents (dependency order)', () => {
    const sectionsIndex = ENTITY_FILES.indexOf('board-sections')
    const documentsIndex = ENTITY_FILES.indexOf('board-documents')

    expect(sectionsIndex).toBeLessThan(documentsIndex)
  })

  it('has event-kinds before events (dependency order)', () => {
    const kindsIndex = ENTITY_FILES.indexOf('event-kinds')
    const eventsIndex = ENTITY_FILES.indexOf('events')

    expect(kindsIndex).toBeLessThan(eventsIndex)
  })
})
