import { describe, expect, it } from 'vitest'

import {
  buildManagementSections,
  buildPersonalItems,
  buildTabBar,
  hasManagementSections,
  isNavItemActive,
  type NavigationPermissions,
} from './navigation-config'

function permissions(overrides: Partial<NavigationPermissions> = {}): NavigationPermissions {
  return {
    canViewBoard: false,
    canUploadDocument: false,
    canManageBoard: false,
    canViewPublishers: false,
    canViewTerritories: false,
    canViewProspection: false,
    canManageTerritories: false,
    canManageSettings: false,
    canManageUsers: false,
    canManagePioneerGoals: false,
    canViewPrograms: false,
    canViewAbsences: false,
    canViewActivity: false,
    canViewExternalSpeakers: false,
    canManageExternalSpeakers: false,
    canViewRoles: false,
    canManageRoles: false,
    canManagePermissions: false,
    isPlatformAdmin: false,
    ...overrides,
  }
}

describe('buildTabBar', () => {
  it('gives a no-responsibility publisher the personal tabs without the board', () => {
    const tabs = buildTabBar(permissions())
    expect(tabs.map(t => t.id)).toEqual(['home', 'my-territories', 'profile'])
  })

  it('includes the board tab when the member can view the board', () => {
    const tabs = buildTabBar(permissions({ canViewBoard: true }))
    expect(tabs.map(t => t.id)).toEqual(['home', 'board', 'my-territories', 'profile'])
  })

  it('keeps the same personal tabs for a full administrator', () => {
    const everything = permissions({
      canViewBoard: true,
      canManageBoard: true,
      canViewPublishers: true,
      canViewTerritories: true,
      canManageTerritories: true,
      canManageSettings: true,
      canViewPrograms: true,
      isPlatformAdmin: true,
    })
    expect(buildTabBar(everything).map(t => t.id)).toEqual(['home', 'board', 'my-territories', 'profile'])
  })
})

describe('buildManagementSections', () => {
  it('is empty for a no-responsibility publisher', () => {
    expect(buildManagementSections(permissions({ canViewBoard: true }))).toEqual([])
    expect(hasManagementSections(permissions({ canViewBoard: true }))).toBe(false)
  })

  it('builds the board section for a document uploader without manage rights', () => {
    const sections = buildManagementSections(permissions({ canViewBoard: true, canUploadDocument: true }))
    expect(sections.map(s => s.id)).toEqual(['board'])
    expect(sections[0].items.map(i => i.id)).toEqual(['board-view', 'board-documents'])
  })

  it('adds section management for a board manager', () => {
    const sections = buildManagementSections(permissions({ canManageBoard: true }))
    expect(sections[0].items.map(i => i.id)).toEqual(['board-view', 'board-sections', 'board-documents'])
  })

  it('falls back to the absences item when programs are not visible', () => {
    const sections = buildManagementSections(permissions({ canViewAbsences: true }))
    expect(sections.map(s => s.id)).toEqual(['assembly'])
    expect(sections[0].items.map(i => i.id)).toEqual(['absences'])

    const withPrograms = buildManagementSections(permissions({ canViewAbsences: true, canViewPrograms: true }))
    expect(withPrograms[0].items.map(i => i.id)).toEqual(['programs'])
  })

  it('assembles every section for a full administrator, in stable order', () => {
    const sections = buildManagementSections(
      permissions({
        canViewBoard: true,
        canManageBoard: true,
        canUploadDocument: true,
        canViewPublishers: true,
        canViewActivity: true,
        canViewRoles: true,
        canViewPrograms: true,
        canViewTerritories: true,
        canViewProspection: true,
        canManageTerritories: true,
        canManageSettings: true,
        isPlatformAdmin: true,
      }),
    )
    expect(sections.map(s => s.id)).toEqual(['board', 'assembly', 'territories', 'settings', 'platform'])
    const assembly = sections.find(s => s.id === 'assembly')
    expect(assembly?.items.map(i => i.id)).toEqual(['publishers', 'groups', 'activity', 'roles', 'programs'])
    const territories = sections.find(s => s.id === 'territories')
    expect(territories?.items.map(i => i.id)).toEqual(['attributions', 'territories', 'prospection', 'stats'])
  })

  it('shows settings when any settings-adjacent permission is granted', () => {
    for (const flag of [
      'canManageSettings',
      'canManageUsers',
      'canManagePermissions',
      'canManagePioneerGoals',
    ] as const) {
      const sections = buildManagementSections(permissions({ [flag]: true }))
      expect(sections.map(s => s.id)).toEqual(['settings'])
    }
  })
})

describe('buildPersonalItems', () => {
  it('always exposes profile, my territories and my absences', () => {
    expect(buildPersonalItems().map(i => i.id)).toEqual(['profile', 'my-territories', 'my-absences'])
  })
})

describe('isNavItemActive', () => {
  const sections = buildManagementSections(
    permissions({ canViewPublishers: true, canViewActivity: true, canViewTerritories: true, canViewPrograms: true }),
  )
  const assembly = sections.find(s => s.id === 'assembly')
  const territories = sections.find(s => s.id === 'territories')
  const publishersItem = assembly?.items.find(i => i.id === 'publishers')
  const programsItem = assembly?.items.find(i => i.id === 'programs')
  const territoriesItem = territories?.items.find(i => i.id === 'territories')

  it('keeps the publishers entry lit on a publisher record page', () => {
    expect(isNavItemActive(publishersItem!, '/publishers/1199/view', false)).toBe(true)
    expect(isNavItemActive(publishersItem!, '/publishers', false)).toBe(true)
  })

  it('yields the activity sibling its own pages', () => {
    expect(isNavItemActive(publishersItem!, '/publishers/activity/pioneers', false)).toBe(false)
  })

  it('keeps the territories entry lit on a territory sheet but not on sibling areas', () => {
    expect(isNavItemActive(territoriesItem!, '/territories/territory/575/view', false)).toBe(true)
    expect(isNavItemActive(territoriesItem!, '/territories/attributions/new', false)).toBe(false)
    expect(isNavItemActive(territoriesItem!, '/territories/buildings', false)).toBe(false)
  })

  it('lights the programmes entry across events, speakers and days off', () => {
    expect(isNavItemActive(programsItem!, '/programs/events/421/view', false)).toBe(true)
    expect(isNavItemActive(programsItem!, '/programs/external-speakers', false)).toBe(true)
  })

  it('falls back to the NavLink state for items without a matcher', () => {
    const home = buildTabBar(permissions())[0]
    expect(isNavItemActive(home, '/anywhere', true)).toBe(true)
    expect(isNavItemActive(home, '/anywhere', false)).toBe(false)
  })
})
