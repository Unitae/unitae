import { describe, expect, it } from 'vitest'
import { rewriteLegacyEntityType } from './import-audit-consent.server'

describe('rewriteLegacyEntityType', () => {
  it('rewrites every Programme* entityType to its Event*/Template* counterpart', () => {
    expect(rewriteLegacyEntityType('ProgrammeTemplate')).toBe('EventTemplate')
    expect(rewriteLegacyEntityType('ProgrammeTemplatePart')).toBe('TemplatePart')
    expect(rewriteLegacyEntityType('ProgrammeTemplateServiceRole')).toBe('TemplateServiceRole')
    expect(rewriteLegacyEntityType('ProgrammePartAssignment')).toBe('EventPart')
    expect(rewriteLegacyEntityType('ProgrammeServiceRoleAssignment')).toBe('EventServiceRole')
    expect(rewriteLegacyEntityType('ProgrammeTemplateResponsible')).toBe('TemplateResponsible')
  })

  // Non-Programme entity types must pass through untouched. Otherwise a legacy
  // archive with, say, `Member` audit rows would silently drop them.
  it('returns unknown entityTypes verbatim', () => {
    expect(rewriteLegacyEntityType('Member')).toBe('Member')
    expect(rewriteLegacyEntityType('Territory')).toBe('Territory')
    expect(rewriteLegacyEntityType('SomethingUnknown')).toBe('SomethingUnknown')
  })

  it('preserves null (AuditLog.entityType is nullable)', () => {
    expect(rewriteLegacyEntityType(null)).toBeNull()
  })
})
