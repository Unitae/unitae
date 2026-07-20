import { describe, expect, it } from 'vitest'
import { rewriteLegacyEntityType } from './import-audit-consent.server'

describe('rewriteLegacyEntityType', () => {
  // Pre-2.1 archives were exported before the Programme→Event rename. The
  // strings on disk are the ORIGINAL Prisma model names (`ProgrammeTemplate`,
  // `ProgrammeTemplateServiceRole`, …) — not any interim name from the
  // rename PR itself. Assertions below use the exact strings that fresh
  // v2.0 archives contain, verified against `git show <pre-rename>:app/database/schema.prisma`.
  it('rewrites pre-2.1 Programme* entityTypes to current model names', () => {
    expect(rewriteLegacyEntityType('ProgrammeTemplate')).toBe('EventTemplate')
    expect(rewriteLegacyEntityType('ProgrammeTemplatePart')).toBe('TemplatePart')
    expect(rewriteLegacyEntityType('ProgrammeTemplateServiceRole')).toBe('TemplateServicePart')
    expect(rewriteLegacyEntityType('ProgrammePartAssignment')).toBe('EventPart')
    expect(rewriteLegacyEntityType('ProgrammeServiceRoleAssignment')).toBe('EventServicePart')
    expect(rewriteLegacyEntityType('ProgrammeTemplateResponsible')).toBe('TemplateResponsible')
  })

  // 2.1 archives were exported between the Programme→Event rename and the
  // ServiceRole→ServicePart follow-up in this same PR. Their `entityType`
  // strings for the service-role tables still say `EventServiceRole` /
  // `TemplateServiceRole`. Covering these here keeps 2.1 archives importable.
  it('rewrites 2.1 ServiceRole entityTypes to ServicePart', () => {
    expect(rewriteLegacyEntityType('EventServiceRole')).toBe('EventServicePart')
    expect(rewriteLegacyEntityType('TemplateServiceRole')).toBe('TemplateServicePart')
  })

  // Non-legacy entity types must pass through untouched. Otherwise a legacy
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
