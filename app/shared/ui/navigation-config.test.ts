import { describe, expect, it } from 'vitest'

import {
  buildManagementSections,
  buildPersonalItems,
  buildTabBar,
  hasManagementSections,
  isNavItemActive,
  type NavigationPermissions,
  navGroupFor,
} from './navigation-config'

function permissions(overrides: Partial<NavigationPermissions> = {}): NavigationPermissions {
  return {
    canViewBoard: false,
    canUploadDocument: false,
    canManageBoard: false,
    canConfigureBoardSections: false,
    canOrganiseBoardDocuments: false,
    canManageDynamicBoardDocuments: false,
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
    ledGroupId: null,
    ...overrides,
  }
}

describe('buildTabBar', () => {
  it('gives a no-responsibility publisher the personal tabs without the board', () => {
    const tabs = buildTabBar(permissions())
    expect(tabs.map(t => t.id)).toEqual(['home', 'my-territories', 'my-absences'])
  })

  it('includes the board tab when the member can view the board', () => {
    const tabs = buildTabBar(permissions({ canViewBoard: true }))
    expect(tabs.map(t => t.id)).toEqual(['home', 'board', 'my-territories', 'my-absences'])
  })

  it('keeps my absences one tap away, with the profile in the header’s account menu', () => {
    const absences = buildTabBar(permissions()).find(t => t.id === 'my-absences')
    expect(absences?.to).toBe('/me/days-off')
    expect(isNavItemActive(absences!, '/me/days-off/new', true)).toBe(true)
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
    })
    expect(buildTabBar(everything).map(t => t.id)).toEqual(['home', 'board', 'my-territories', 'my-absences'])
  })
})

describe('buildManagementSections', () => {
  it('is empty for a no-responsibility publisher', () => {
    expect(buildManagementSections(permissions({ canViewBoard: true }))).toEqual([])
    expect(hasManagementSections(permissions({ canViewBoard: true }))).toBe(false)
  })

  it('gives anyone holding one of the board management rights « Gérer le tableau », beside the board', () => {
    for (const right of [
      'canUploadDocument',
      'canManageBoard',
      'canOrganiseBoardDocuments',
      'canConfigureBoardSections',
      'canManageDynamicBoardDocuments',
    ] as const) {
      const sections = buildManagementSections(permissions({ canViewBoard: true, [right]: true }))
      expect(
        sections.map(s => s.id),
        right,
      ).toEqual(['board'])
      expect(
        sections[0].items.map(i => i.id),
        right,
      ).toEqual(['board-view', 'board-manage'])
    }
  })

  it('leads « Gérer le tableau » to the one page that manages documents and sections', () => {
    const [board] = buildManagementSections(permissions({ canConfigureBoardSections: true }))
    expect(board.items.find(i => i.id === 'board-manage')?.to).toBe('/board/documents')
  })

  // A group overseer or deputy may open his own group without the publisher permission: the
  // sidebar is how he finds it.
  it('links a group leader without the publisher list to his own group', () => {
    const sections = buildManagementSections(permissions({ ledGroupId: 12 }))
    const items = sections.flatMap(section => section.items)

    expect(items.map(item => [item.id, item.to])).toEqual([['my-group', '/groups/12/view']])
  })

  it('shows the groups list instead to a leader who can view publishers', () => {
    const items = buildManagementSections(permissions({ ledGroupId: 12, canViewPublishers: true })).flatMap(
      section => section.items,
    )

    expect(items.map(item => item.id)).toEqual(['publishers', 'groups'])
  })

  it('gathers programmes, absences and external speakers in their own section, each behind its own right', () => {
    const programsOf = (granted: Partial<NavigationPermissions>) =>
      buildManagementSections(permissions(granted))
        .find(section => section.id === 'programs')
        ?.items.map(item => item.id)

    expect(programsOf({ canViewPrograms: true, canViewAbsences: true, canViewExternalSpeakers: true })).toEqual([
      'programs',
      'absences',
      'external-speakers',
    ])
    expect(programsOf({ canViewAbsences: true })).toEqual(['absences'])
    expect(programsOf({ canViewExternalSpeakers: true })).toEqual(['external-speakers'])
    // Viewing programmes does not grant seeing other people's absences: the page would turn them away.
    expect(programsOf({ canViewPrograms: true })).toEqual(['programs'])
    expect(programsOf({})).toBeUndefined()
  })

  it('assembles every section for a full administrator, in stable order', () => {
    const sections = buildManagementSections(
      permissions({
        canViewBoard: true,
        canManageBoard: true,
        canUploadDocument: true,
        canConfigureBoardSections: true,
        canViewPublishers: true,
        canViewActivity: true,
        canViewRoles: true,
        canViewPrograms: true,
        canViewAbsences: true,
        canViewExternalSpeakers: true,
        canViewTerritories: true,
        canViewProspection: true,
        canManageTerritories: true,
        canManageSettings: true,
      }),
    )
    expect(sections.map(s => s.id)).toEqual(['board', 'assembly', 'programs', 'territories', 'settings'])
    const assembly = sections.find(s => s.id === 'assembly')
    expect(assembly?.items.map(i => i.id)).toEqual(['publishers', 'groups', 'activity', 'organigram'])
    const programs = sections.find(s => s.id === 'programs')
    expect(programs?.items.map(i => i.id)).toEqual(['programs', 'absences', 'external-speakers'])
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
    permissions({
      canViewPublishers: true,
      canViewActivity: true,
      canViewTerritories: true,
      canViewPrograms: true,
      canViewAbsences: true,
      canViewExternalSpeakers: true,
    }),
  )
  const assembly = sections.find(s => s.id === 'assembly')
  const territories = sections.find(s => s.id === 'territories')
  const publishersItem = assembly?.items.find(i => i.id === 'publishers')
  const programsItem = sections.find(s => s.id === 'programs')?.items.find(i => i.id === 'programs')
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

  it('keeps the programmes entry lit on an event but yields absences and speakers their own entries', () => {
    expect(isNavItemActive(programsItem!, '/programs/events/421/view', false)).toBe(true)
    expect(isNavItemActive(programsItem!, '/programs/new', false)).toBe(true)
    expect(isNavItemActive(programsItem!, '/programs/external-speakers', false)).toBe(false)
    expect(isNavItemActive(programsItem!, '/programs/external-speakers/3/edit', false)).toBe(false)
    expect(isNavItemActive(programsItem!, '/programs/days-off', false)).toBe(false)
  })

  it('does not match sibling paths that merely share the prefix string', () => {
    expect(isNavItemActive(publishersItem!, '/publishersAudit', false)).toBe(false)
    expect(isNavItemActive(territoriesItem!, '/territoriesArchive', false)).toBe(false)
    // Exclusion boundaries behave the same way: an activity-adjacent sibling
    // path is NOT excluded, so it still lights the publishers entry.
    expect(isNavItemActive(publishersItem!, '/publishers/activity-report', false)).toBe(true)
  })

  it('falls back to the NavLink state for items without a matcher', () => {
    const home = buildTabBar(permissions())[0]
    expect(isNavItemActive(home, '/anywhere', true)).toBe(true)
    expect(isNavItemActive(home, '/anywhere', false)).toBe(false)
  })
})

describe('organigram in the assembly section', () => {
  it('points a can-view-roles holder at the chart, not the role list', () => {
    // The organigram is the primary view of congregation structure; the eligibility matrix is a
    // tab on it. Nothing linked to the chart at all before this, so it was reachable only by URL.
    const sections = buildManagementSections(permissions({ canViewRoles: true }))
    const assembly = sections.find(s => s.id === 'assembly')
    const item = assembly?.items.find(i => i.id === 'organigram')

    expect(item?.to).toBe('/congregation/roles/organigram')
    expect(assembly?.items.some(i => i.id === 'roles')).toBe(false)
  })

  it('stays hidden without can-view-roles', () => {
    const sections = buildManagementSections(permissions({ canViewPublishers: true }))
    const assembly = sections.find(s => s.id === 'assembly')

    expect(assembly?.items.some(i => i.id === 'organigram')).toBe(false)
  })

  it('highlights while anywhere under congregation/roles, so the matrix tab keeps it lit', () => {
    const sections = buildManagementSections(permissions({ canViewRoles: true }))
    const item = sections.find(s => s.id === 'assembly')?.items.find(i => i.id === 'organigram')

    expect(item).toBeDefined()
    // Third argument is NavLink's own `isActive`, which is false on the matrix tab because the
    // item points at the chart. `match.prefix` is what keeps the sidebar lit across both tabs.
    expect(isNavItemActive(item as never, '/congregation/roles', false)).toBe(true)
    expect(isNavItemActive(item as never, '/congregation/roles/organigram', true)).toBe(true)
  })
})

describe('navGroupFor', () => {
  it('names the group a page belongs to, for the start of its trail', () => {
    expect(navGroupFor('/publishers')).toBe('Assemblée')
    expect(navGroupFor('/publishers/12/view')).toBe('Assemblée')
    expect(navGroupFor('/programs/events/421')).toBe('Programmes')
    expect(navGroupFor('/programs/external-speakers/3/edit')).toBe('Programmes')
    expect(navGroupFor('/programs/days-off')).toBe('Programmes')
    expect(navGroupFor('/territories/buildings/8/view')).toBe('Territoires')
    expect(navGroupFor('/board/documents')).toBe("Tableau d'affichage")
  })

  it('names no group for pages outside the groups', () => {
    expect(navGroupFor('/')).toBeNull()
    expect(navGroupFor('/me/profile')).toBeNull()
  })

  it('names no group that holds a single page, whose label would repeat the page’s', () => {
    expect(navGroupFor('/settings/users')).toBeNull()
  })

  it('does not take a sibling path that merely shares the prefix', () => {
    expect(navGroupFor('/publishersAudit')).toBeNull()
  })
})
