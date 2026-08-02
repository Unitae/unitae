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
  it('is the current 2.3 schema version', () => {
    expect(ARCHIVE_VERSION).toBe('2.4')
  })
})

describe('ENTITY_FILES', () => {
  it('contains the expected entity types in dependency order', () => {
    expect(ENTITY_FILES[0]).toBe('congregation')
    expect(ENTITY_FILES).toContain('members')
    expect(ENTITY_FILES).toContain('user-accounts')
    expect(ENTITY_FILES).toContain('member-role-assignments')
    expect(ENTITY_FILES).toContain('territories')
    expect(ENTITY_FILES).toContain('board-documents')
  })

  it('has members before publisher-groups (dependency order)', () => {
    const membersIndex = ENTITY_FILES.indexOf('members')
    const groupsIndex = ENTITY_FILES.indexOf('publisher-groups')

    expect(membersIndex).toBeLessThan(groupsIndex)
  })

  it('has members before emergency-contacts (dependency order)', () => {
    expect(ENTITY_FILES.indexOf('members')).toBeLessThan(ENTITY_FILES.indexOf('emergency-contacts'))
  })

  it('includes pioneer-goals (congregation-scoped, no cross-entity refs)', () => {
    expect(ENTITY_FILES).toContain('pioneer-goals')
  })

  it('has members before pioneer-enrolments (dependency order)', () => {
    expect(ENTITY_FILES).toContain('pioneer-enrolments')
    expect(ENTITY_FILES.indexOf('members')).toBeLessThan(ENTITY_FILES.indexOf('pioneer-enrolments'))
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

  it('has programme-templates before events (dependency order)', () => {
    const templatesIndex = ENTITY_FILES.indexOf('programme-templates')
    const eventsIndex = ENTITY_FILES.indexOf('events')

    expect(templatesIndex).toBeLessThan(eventsIndex)
  })

  it('has roles before role-permissions (dependency order)', () => {
    expect(ENTITY_FILES.indexOf('roles')).toBeLessThan(ENTITY_FILES.indexOf('role-permissions'))
  })

  it('has roles and user-accounts before user-role-assignments (dependency order)', () => {
    const userRoleAssignmentsIndex = ENTITY_FILES.indexOf('user-role-assignments')
    expect(ENTITY_FILES.indexOf('roles')).toBeLessThan(userRoleAssignmentsIndex)
    expect(ENTITY_FILES.indexOf('user-accounts')).toBeLessThan(userRoleAssignmentsIndex)
  })

  it('has roles and members before member-role-assignments (dependency order)', () => {
    const memberRoleAssignmentsIndex = ENTITY_FILES.indexOf('member-role-assignments')
    expect(ENTITY_FILES.indexOf('roles')).toBeLessThan(memberRoleAssignmentsIndex)
    expect(ENTITY_FILES.indexOf('members')).toBeLessThan(memberRoleAssignmentsIndex)
  })

  it('has external-speakers before programme-part-assignments (dependency order)', () => {
    expect(ENTITY_FILES.indexOf('external-speakers')).toBeLessThan(ENTITY_FILES.indexOf('programme-part-assignments'))
  })

  it('has board-sections and roles before board-section-visibility-roles (dependency order)', () => {
    const visibilityIndex = ENTITY_FILES.indexOf('board-section-visibility-roles')
    expect(ENTITY_FILES.indexOf('board-sections')).toBeLessThan(visibilityIndex)
    expect(ENTITY_FILES.indexOf('roles')).toBeLessThan(visibilityIndex)
  })

  it('has programme-template-parts before programme-template-part-allowed-roles (dependency order)', () => {
    expect(ENTITY_FILES.indexOf('programme-template-parts')).toBeLessThan(
      ENTITY_FILES.indexOf('programme-template-part-allowed-roles'),
    )
  })

  it('has programme-part-assignments before programme-part-assignment-allowed-roles (dependency order)', () => {
    expect(ENTITY_FILES.indexOf('programme-part-assignments')).toBeLessThan(
      ENTITY_FILES.indexOf('programme-part-assignment-allowed-roles'),
    )
  })
})
