import {
  BarChart3,
  Building2,
  CalendarCheck,
  CalendarDays,
  CalendarOff,
  CalendarRange,
  FileText,
  Home,
  LayoutGrid,
  type LucideIcon,
  Map as MapIcon,
  MapPin,
  Network,
  PieChart,
  Settings,
  User,
  UserCog,
  Users,
  UsersRound,
} from 'lucide-react'

import * as m from '~/i18n/paraglide/messages'

export interface NavigationPermissions {
  canViewBoard: boolean
  canUploadDocument: boolean
  canManageBoard: boolean
  /** The right the sections page checks; reviewing documents does not grant it. */
  canConfigureBoardSections: boolean
  canOrganiseBoardDocuments: boolean
  canManageDynamicBoardDocuments: boolean
  canViewPublishers: boolean
  canViewTerritories: boolean
  /** The attributions list, a right of its own. */
  canViewAttributions: boolean
  canManageCampaigns: boolean
  canViewProspection: boolean
  canManageTerritories: boolean
  canManageSettings: boolean
  canManageUsers: boolean
  canManagePioneerGoals: boolean
  canViewPrograms: boolean
  canViewAbsences: boolean
  canViewActivity: boolean
  canViewExternalSpeakers: boolean
  canManageExternalSpeakers: boolean
  canViewRoles: boolean
  canManageRoles: boolean
  canManagePermissions: boolean
  /** The group the member oversees or assists, which he may open without `canViewPublishers`. */
  ledGroupId: number | null
}

export interface NavItem {
  id: string
  label: () => string
  icon: LucideIcon
  to: string
  /** Pass to NavLink so the item only highlights on an exact route match. */
  end?: boolean
  /**
   * Section-highlight matcher: the item lights up for every path under
   * `prefix` (path-segment boundaries respected) except paths owned by
   * sibling items (`exclude`). `match` and `end` are complementary, not
   * exclusive: `end` still controls NavLink's exact-match `aria-current`,
   * while `match` takes precedence for the VISUAL active state in
   * `isNavItemActive`. Without `match`, highlighting follows NavLink's own
   * matching (`to` + `end`).
   */
  match?: { prefix: string; exclude?: string[] }
}

/**
 * Whether `pathname` is `prefix` itself or nested below it. Plain
 * `startsWith` would let a sibling like `/publishersAudit` light the
 * `/publishers` entry.
 */
function pathIsWithin(pathname: string, prefix: string): boolean {
  if (!pathname.startsWith(prefix)) return false
  const rest = pathname.slice(prefix.length)
  return rest === '' || rest.startsWith('/')
}

/** Whether `item` should render as active for the current pathname. */
export function isNavItemActive(item: NavItem, pathname: string, navLinkActive: boolean): boolean {
  if (!item.match) return navLinkActive
  if (!pathIsWithin(pathname, item.match.prefix)) return false
  return !item.match.exclude?.some(prefix => pathIsWithin(pathname, prefix))
}

export interface NavSection {
  id: string
  label: () => string
  items: NavItem[]
}

/**
 * Personal tab bar — identical for every signed-in member so daily navigation
 * stays predictable across permission levels. Responsibilities never change
 * these tabs; they only add management sections behind the "Plus" overflow.
 */
export function buildTabBar(permissions: NavigationPermissions): NavItem[] {
  const tabs: NavItem[] = [{ id: 'home', label: m.sidebar_home, icon: Home, to: '/', end: true }]
  if (permissions.canViewBoard) {
    tabs.push({
      id: 'board',
      label: m.nav_tab_board,
      icon: LayoutGrid,
      to: '/board',
      end: true,
      match: { prefix: '/board' },
    })
  }
  tabs.push(
    { id: 'my-territories', label: m.sidebar_my_territories, icon: MapPin, to: '/me/territories' },
    // The profile lives in the phone header's account menu, next to signing out.
    { id: 'my-absences', label: m.sidebar_my_absences, icon: CalendarOff, to: '/me/days-off' },
  )
  return tabs
}

/**
 * Management sections a responsibility-holder can access. Feeds the mobile
 * "Plus" sheet and the desktop sidebar groups — permission logic lives here
 * only, never in the consuming chrome.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: single flat catalog of permission-gated sections
export function buildManagementSections(permissions: NavigationPermissions): NavSection[] {
  const sections: NavSection[] = []

  // One page manages the board, documents and sections alike; it opens to whoever holds any of
  // the rights its actions check, and shows each action only with its own.
  const managesBoard =
    permissions.canUploadDocument ||
    permissions.canManageBoard ||
    permissions.canOrganiseBoardDocuments ||
    permissions.canConfigureBoardSections ||
    permissions.canManageDynamicBoardDocuments
  if (managesBoard) {
    sections.push({
      id: 'board',
      label: m.sidebar_board,
      items: [
        { id: 'board-view', label: m.sidebar_board, icon: LayoutGrid, to: '/board', end: true },
        { id: 'board-manage', label: m.sidebar_board_manage, icon: FileText, to: '/board/documents' },
      ],
    })
  }

  const assemblyItems: NavItem[] = []
  if (permissions.canViewPublishers) {
    assemblyItems.push(
      {
        id: 'publishers',
        label: m.sidebar_publishers,
        icon: Users,
        to: '/publishers',
        end: true,
        match: { prefix: '/publishers', exclude: ['/publishers/activity'] },
      },
      { id: 'groups', label: m.sidebar_publisher_groups, icon: UsersRound, to: '/groups' },
    )
  } else if (permissions.ledGroupId != null) {
    assemblyItems.push({
      id: 'my-group',
      label: m.sidebar_my_group,
      icon: UsersRound,
      to: `/groups/${permissions.ledGroupId}/view`,
    })
  }
  if (permissions.canViewActivity) {
    assemblyItems.push({ id: 'activity', label: m.sidebar_activity, icon: BarChart3, to: '/publishers/activity' })
  }
  if (permissions.canViewRoles) {
    // The chart, not the role list: it is the view of congregation structure people recognise,
    // and the eligibility matrix is a tab on it. `match` keeps the item lit on both tabs.
    assemblyItems.push({
      id: 'organigram',
      label: m.sidebar_assembly_organigram,
      icon: Network,
      to: '/congregation/roles/organigram',
      match: { prefix: '/congregation/roles' },
    })
  }
  if (assemblyItems.length > 0) {
    sections.push({ id: 'assembly', label: m.sidebar_assembly, items: assemblyItems })
  }

  // What preparing the programme needs, each entry behind the right its page checks: seeing
  // the programmes does not grant seeing other people's absences.
  const programItems: NavItem[] = []
  if (permissions.canViewPrograms) {
    programItems.push({
      id: 'programs',
      label: m.sidebar_programs,
      icon: CalendarDays,
      to: '/programs',
      end: true,
      match: { prefix: '/programs', exclude: ['/programs/days-off', '/programs/external-speakers'] },
    })
  }
  if (permissions.canViewAbsences) {
    programItems.push({ id: 'absences', label: m.sidebar_absences, icon: CalendarOff, to: '/programs/days-off' })
  }
  if (permissions.canViewExternalSpeakers) {
    programItems.push({
      id: 'external-speakers',
      label: m.sidebar_external_speakers,
      icon: UserCog,
      to: '/programs/external-speakers',
    })
  }
  if (programItems.length > 0) {
    sections.push({ id: 'programs', label: m.sidebar_programs, items: programItems })
  }

  const territoryItems: NavItem[] = []
  // The territories area admits those who see the territories or the prospection: the attributions and the campaigns
  // show only inside it, to those holding their own right.
  const inTerritoryArea = permissions.canViewTerritories || permissions.canViewProspection
  if (inTerritoryArea && permissions.canViewAttributions) {
    territoryItems.push({
      id: 'attributions',
      label: m.sidebar_attributions,
      icon: CalendarCheck,
      to: '/territories/attributions',
      match: { prefix: '/territories/attributions', exclude: ['/territories/attributions/campaigns'] },
    })
  }
  if (inTerritoryArea && permissions.canManageCampaigns) {
    territoryItems.push({
      id: 'campaigns',
      label: m.sidebar_campaigns,
      icon: CalendarRange,
      to: '/territories/attributions/campaigns',
    })
  }
  if (permissions.canViewTerritories) {
    territoryItems.push({
      id: 'territories',
      label: m.sidebar_territories,
      icon: MapIcon,
      to: '/territories',
      end: true,
      match: {
        prefix: '/territories',
        exclude: ['/territories/attributions', '/territories/buildings', '/territories/stats'],
      },
    })
  }
  if (permissions.canViewProspection) {
    territoryItems.push({
      id: 'prospection',
      label: m.sidebar_prospection,
      icon: Building2,
      to: '/territories/buildings',
    })
  }
  if (permissions.canManageTerritories) {
    territoryItems.push({ id: 'stats', label: m.sidebar_statistics, icon: PieChart, to: '/territories/stats' })
  }
  if (territoryItems.length > 0) {
    sections.push({ id: 'territories', label: m.sidebar_territories, items: territoryItems })
  }

  if (
    permissions.canManageSettings ||
    permissions.canManageUsers ||
    permissions.canManagePermissions ||
    permissions.canManagePioneerGoals
  ) {
    sections.push({
      id: 'settings',
      label: m.sidebar_settings,
      items: [{ id: 'settings', label: m.sidebar_settings, icon: Settings, to: '/settings' }],
    })
  }

  return sections
}

/** Personal items shown in the desktop sidebar footer and the mobile "Plus" sheet. */
export function buildPersonalItems(): NavItem[] {
  return [
    { id: 'profile', label: m.sidebar_my_profile, icon: User, to: '/me/profile' },
    { id: 'my-territories', label: m.sidebar_my_territories, icon: MapPin, to: '/me/territories' },
    { id: 'my-absences', label: m.sidebar_my_absences, icon: CalendarOff, to: '/me/days-off' },
  ]
}

/** Whether the mobile chrome should show the "Plus" overflow tab at all. */
export function hasManagementSections(permissions: NavigationPermissions): boolean {
  return buildManagementSections(permissions).length > 0
}

/** Every section and item, whatever the viewer may open: naming where a page sits needs no permission. */
const EVERY_PERMISSION: NavigationPermissions = {
  canViewBoard: true,
  canUploadDocument: true,
  canManageBoard: true,
  canConfigureBoardSections: true,
  canOrganiseBoardDocuments: true,
  canManageDynamicBoardDocuments: true,
  canViewPublishers: true,
  canViewTerritories: true,
  canViewAttributions: true,
  canManageCampaigns: true,
  canViewProspection: true,
  canManageTerritories: true,
  canManageSettings: true,
  canManageUsers: true,
  canManagePioneerGoals: true,
  canViewPrograms: true,
  canViewAbsences: true,
  canViewActivity: true,
  canViewExternalSpeakers: true,
  canManageExternalSpeakers: true,
  canViewRoles: true,
  canManageRoles: true,
  canManagePermissions: true,
  ledGroupId: null,
}

function itemCovers(item: NavItem, pathname: string): boolean {
  if (item.match) return isNavItemActive(item, pathname, false)
  return item.end ? pathname === item.to : pathIsWithin(pathname, item.to)
}

/**
 * The sidebar group a page belongs to, for the start of its trail: « Assemblée › Proclamateurs ». None for pages
 * outside the groups (home, the personal pages), nor for a group holding a single page (Réglages, Administration),
 * whose label would only repeat the page's.
 */
export function navGroupFor(pathname: string): string | null {
  for (const section of buildManagementSections(EVERY_PERMISSION)) {
    if (section.items.length < 2) continue
    if (section.items.some(item => itemCovers(item, pathname))) return section.label()
  }
  return null
}
