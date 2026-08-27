import { describe, expect, it } from 'vitest'
import {
  collectEnforcedPermissions,
  findDanglingRequires,
  findMissingDescriptions,
  findUnenforcedPermissions,
} from './check-permission-coverage'

describe('collectEnforcedPermissions', () => {
  it('counts requirePermission as enforcement', () => {
    const src = 'requirePermission(permissions, Permission.TerritoriesManager)'
    expect([...collectEnforcedPermissions(src)]).toEqual(['TerritoriesManager'])
  })

  it('counts an inline negated has() whose branch throws', () => {
    const src = ['if (!permissions.has(Permission.TerritoriesViewer)) {', "  throw redirect('/')", '}'].join('\n')
    expect([...collectEnforcedPermissions(src)]).toEqual(['TerritoriesViewer'])
  })

  it('follows a boolean bound to has() and thrown on later — the common idiom', () => {
    const src = [
      'const canViewPublisher = permissions.has(Permission.PublisherViewer)',
      'const canManagePublisher = permissions.has(Permission.PublisherManager)',
      '',
      'if (!canViewPublisher) {',
      "  logger.warn('nope')",
      "  throw redirect('/')",
      '}',
    ].join('\n')
    // Only the one guarding a throw counts; the other is a UI flag.
    expect([...collectEnforcedPermissions(src)]).toEqual(['PublisherViewer'])
  })

  it('does NOT count a permission read only into the loader payload', () => {
    // This is exactly what absence-viewer does today: consulted, never enforced.
    const src = [
      'const canViewAbsences = permissions.has(Permission.AbsenceViewer)',
      'return { canViewAbsences }',
    ].join('\n')
    expect([...collectEnforcedPermissions(src)]).toEqual([])
  })

  it('counts an OR guard as enforcing every permission it names', () => {
    const src = [
      'if (!permissions.has(Permission.ProgramViewer) && !permissions.has(Permission.Admin)) {',
      "  throw redirect('/')",
      '}',
    ].join('\n')
    expect([...collectEnforcedPermissions(src)].sort()).toEqual(['Admin', 'ProgramViewer'])
  })

  it('follows a boolean bound to several permissions at once', () => {
    // emergency-roster.tsx and external-speakers/list.tsx both read this way.
    const src = [
      'const canView = permissions.has(Permission.EmergencyInfoViewer) || permissions.has(Permission.EmergencyInfoManager)',
      'if (!canView) {',
      "  throw redirect('/')",
      '}',
    ].join('\n')
    expect([...collectEnforcedPermissions(src)].sort()).toEqual(['EmergencyInfoManager', 'EmergencyInfoViewer'])
  })

  it('follows a binding that spans several lines', () => {
    // publishers/routes/_layout.tsx wraps its OR across lines.
    const src = [
      'const canReachEmergency =',
      '  permissions.has(Permission.EmergencyInfoViewer) ||',
      '  permissions.has(Permission.EmergencyInfoManager)',
      '',
      'if (!canReachEmergency) {',
      "  throw redirect('/')",
      '}',
    ].join('\n')
    expect([...collectEnforcedPermissions(src)].sort()).toEqual(['EmergencyInfoManager', 'EmergencyInfoViewer'])
  })

  it('follows a boolean defined in terms of another boolean', () => {
    // external-speakers/list.tsx: `const canView = canManage || permissions.has(...)`
    const src = [
      'const canManage = permissions.has(Permission.ExternalSpeakerManager)',
      'const canView = canManage || permissions.has(Permission.ExternalSpeakerViewer)',
      'if (!canView) {',
      "  throw redirect('/')",
      '}',
    ].join('\n')
    expect([...collectEnforcedPermissions(src)].sort()).toEqual(['ExternalSpeakerManager', 'ExternalSpeakerViewer'])
  })

  it('counts a permission named inside a throwing guard, even as a call argument', () => {
    // events/assign-part.tsx delegates to canEditEvent, passing the capability it needs.
    const src = [
      'if (!(await canEditEvent(db, can, userId, templateId, congregationId, Permission.CanAssignProgramParts))) {',
      "  throw redirect('/programs')",
      '}',
    ].join('\n')
    expect([...collectEnforcedPermissions(src)]).toEqual(['CanAssignProgramParts'])
  })

  it('counts a permission handed to an authorisation helper that narrows a selection', () => {
    // bulk-release.tsx never throws — it filters the ids down to the permitted ones.
    const src = 'return filterToManageableEventIds(db, can, ids, userId, congregationId, Permission.CanPublishPrograms)'
    expect([...collectEnforcedPermissions(src)]).toEqual(['CanPublishPrograms'])
  })

  it('ignores a throw that is not inside the guard', () => {
    const src = [
      'const canManage = permissions.has(Permission.TerritoriesManager)',
      'if (somethingElse) {',
      "  throw redirect('/')",
      '}',
      'return { canManage }',
    ].join('\n')
    expect([...collectEnforcedPermissions(src)]).toEqual([])
  })
})

describe('findUnenforcedPermissions', () => {
  it('reports a permission nothing enforces', () => {
    const all = ['BoardViewer', 'AbsenceViewer']
    const enforced = new Set(['BoardViewer'])
    expect(findUnenforcedPermissions(all, enforced)).toEqual(['AbsenceViewer'])
  })

  it('passes when every permission is enforced somewhere', () => {
    const all = ['BoardViewer', 'AbsenceViewer']
    const enforced = new Set(['BoardViewer', 'AbsenceViewer'])
    expect(findUnenforcedPermissions(all, enforced)).toEqual([])
  })
})

describe('findMissingDescriptions', () => {
  const en = { permission_desc_board_viewer: 'View the board' }
  const fr = { permission_desc_board_viewer: 'Voir le tableau' }

  it('passes when both catalogues carry the key', () => {
    expect(findMissingDescriptions(['board-viewer'], { en, fr })).toEqual([])
  })

  it('reports a key missing from one locale only', () => {
    // The typechecker cannot catch this: the catalogues are plain JSON.
    expect(findMissingDescriptions(['board-viewer'], { en, fr: {} })).toEqual([
      { locale: 'fr', key: 'permission_desc_board_viewer' },
    ])
  })

  it('converts kebab keys to the snake_case message key', () => {
    expect(findMissingDescriptions(['emergency-info-viewer'], { en: {}, fr: {} })).toEqual([
      { locale: 'en', key: 'permission_desc_emergency_info_viewer' },
      { locale: 'fr', key: 'permission_desc_emergency_info_viewer' },
    ])
  })
})

describe('findDanglingRequires', () => {
  it('reports a prerequisite that is not a real permission', () => {
    const requires = { CanManageTerritoryAttributions: ['CanViewPublishers', 'Nonexistent'] }
    expect(findDanglingRequires(requires, ['CanManageTerritoryAttributions', 'CanViewPublishers'])).toEqual([
      'Nonexistent',
    ])
  })

  it('reports a key that is not a real permission', () => {
    const requires = { Ghost: ['CanViewPublishers'] }
    expect(findDanglingRequires(requires, ['CanViewPublishers'])).toEqual(['Ghost'])
  })

  it('passes on a sound map', () => {
    const requires = { CanManageTerritoryAttributions: ['CanViewPublishers'] }
    expect(findDanglingRequires(requires, ['CanManageTerritoryAttributions', 'CanViewPublishers'])).toEqual([])
  })
})
