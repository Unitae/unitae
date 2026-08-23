import {
  BarChart3,
  Building2,
  CalendarCheck,
  CalendarDays,
  CalendarOff,
  FileText,
  FolderOpen,
  Home,
  LayoutGrid,
  type LucideIcon,
  Map as MapIcon,
  MapPin,
  PieChart,
  Settings,
  Shield,
  User,
  UserRoundCog,
  Users,
  UsersRound,
} from 'lucide-react'

import * as m from '~/i18n/paraglide/messages'

export interface NavigationPermissions {
  canViewBoard: boolean
  canUploadDocument: boolean
  canManageBoard: boolean
  canViewPublishers: boolean
  canViewTerritories: boolean
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
  isPlatformAdmin: boolean
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
   * `prefix` except paths owned by sibling items (`exclude`). Without it,
   * highlighting follows NavLink's own matching (`to` + `end`).
   */
  match?: { prefix: string; exclude?: string[] }
}

/** Whether `item` should render as active for the current pathname. */
export function isNavItemActive(item: NavItem, pathname: string, navLinkActive: boolean): boolean {
  if (!item.match) return navLinkActive
  if (!pathname.startsWith(item.match.prefix)) return false
  return !item.match.exclude?.some(prefix => pathname.startsWith(prefix))
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
    { id: 'profile', label: m.nav_tab_profile, icon: User, to: '/me/profile' },
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

  if (permissions.canUploadDocument || permissions.canManageBoard) {
    const items: NavItem[] = [{ id: 'board-view', label: m.sidebar_board, icon: LayoutGrid, to: '/board', end: true }]
    if (permissions.canManageBoard) {
      items.push({ id: 'board-sections', label: m.sidebar_sections, icon: FolderOpen, to: '/board/sections' })
    }
    items.push({ id: 'board-documents', label: m.sidebar_documents, icon: FileText, to: '/board/documents' })
    sections.push({ id: 'board', label: m.sidebar_board, items })
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
  }
  if (permissions.canViewActivity) {
    assemblyItems.push({ id: 'activity', label: m.sidebar_activity, icon: BarChart3, to: '/publishers/activity' })
  }
  if (permissions.canViewRoles) {
    assemblyItems.push({ id: 'roles', label: m.sidebar_assembly_roles, icon: Shield, to: '/congregation/roles' })
  }
  if (permissions.canViewPrograms) {
    assemblyItems.push({
      id: 'programs',
      label: m.sidebar_programs,
      icon: CalendarDays,
      to: '/programs',
      end: true,
      match: { prefix: '/programs' },
    })
  } else if (permissions.canViewAbsences) {
    assemblyItems.push({ id: 'absences', label: m.sidebar_absences, icon: CalendarOff, to: '/programs/days-off' })
  }
  if (assemblyItems.length > 0) {
    sections.push({ id: 'assembly', label: m.sidebar_assembly, items: assemblyItems })
  }

  const territoryItems: NavItem[] = []
  if (permissions.canViewTerritories) {
    territoryItems.push(
      { id: 'attributions', label: m.sidebar_attributions, icon: CalendarCheck, to: '/territories/attributions' },
      {
        id: 'territories',
        label: m.sidebar_territories,
        icon: MapIcon,
        to: '/territories',
        end: true,
        match: {
          prefix: '/territories',
          exclude: ['/territories/attributions', '/territories/buildings', '/territories/stats'],
        },
      },
    )
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

  if (permissions.isPlatformAdmin) {
    sections.push({
      id: 'platform',
      label: m.sidebar_platform,
      items: [{ id: 'platform-admin', label: m.sidebar_administration, icon: UserRoundCog, to: '/platform-admin' }],
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
