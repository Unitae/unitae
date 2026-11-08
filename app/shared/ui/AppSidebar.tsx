import { Kbd } from '@unitae/ui'
import { Home, LayoutGrid, Search } from 'lucide-react'
import { NavLink, useLocation } from 'react-router'

import * as m from '~/i18n/paraglide/messages'
import {
  buildManagementSections,
  buildPersonalItems,
  isNavItemActive,
  type NavItem,
  type NavigationPermissions,
  type NavSection,
} from '~/shared/ui/navigation-config'
import { UserMenu, WorkspaceMenu } from '~/shared/ui/ShellMenus'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '~/shared/ui/sidebar'

export type AppSidebarPermissions = NavigationPermissions

interface AppSidebarProps {
  permissions: AppSidebarPermissions
  congregationName?: string
  userName: string
  onSearchClick?: () => void
}

/** Sections that live in the footer, as single entries, rather than among the groups. */
const FOOTER_SECTIONS = new Set(['settings'])

export function AppSidebar({ permissions, congregationName, userName, onSearchClick }: AppSidebarProps) {
  const sections = buildManagementSections(permissions)
  // Members without board management see the board as a simple top-level item;
  // managers get it inside the board section instead.
  const showSimpleBoardItem = permissions.canViewBoard && !sections.some(section => section.id === 'board')
  // Mon profil lives in the user menu at the foot.
  const personalItems = buildPersonalItems().filter(item => item.id !== 'profile')
  const footerItems = sections.filter(section => FOOTER_SECTIONS.has(section.id)).flatMap(section => section.items)

  return (
    <Sidebar>
      <SidebarHeader className="gap-3 px-2.5 pt-3 pb-1">
        <WorkspaceMenu name={congregationName || 'Unitae'} />
        <button
          type="button"
          onClick={onSearchClick}
          className="flex h-8 items-center gap-2 rounded-md border border-input bg-surface pr-1.5 pl-2.5 text-faint text-sm transition-colors hover:border-faint"
        >
          <Search className="size-4 shrink-0" aria-hidden="true" />
          <span className="flex-1 truncate text-left">{m.sidebar_search()}</span>
          <Kbd>⌘K</Kbd>
        </button>
      </SidebarHeader>

      <SidebarContent className="px-1 [scrollbar-width:thin]">
        <nav aria-label={m.nav_primary()} className="flex flex-col gap-1.5">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarNavItem item={{ id: 'home', label: m.sidebar_home, icon: Home, to: '/', end: true }} />
                {showSimpleBoardItem && (
                  <SidebarNavItem item={{ id: 'board', label: m.sidebar_board, icon: LayoutGrid, to: '/board' }} />
                )}
                {personalItems.map(item => (
                  <SidebarNavItem key={item.id} item={item} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {sections
            .filter(section => !FOOTER_SECTIONS.has(section.id))
            .map(section => (
              <SidebarNavSection key={section.id} section={section} />
            ))}
        </nav>
      </SidebarContent>

      <SidebarFooter className="gap-0.5 px-2.5 pt-1 pb-3">
        {footerItems.length > 0 && (
          <SidebarMenu>
            {footerItems.map(item => (
              <SidebarNavItem key={item.id} item={item} />
            ))}
          </SidebarMenu>
        )}
        <UserMenu name={userName} />
      </SidebarFooter>
    </Sidebar>
  )
}

/** A group of the sidebar, labelled in sentence case. A group of one is just its entry. */
function SidebarNavSection({ section }: { section: NavSection }) {
  return (
    <SidebarGroup>
      {section.items.length > 1 && <SidebarGroupLabel>{section.label()}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {section.items.map(item => (
            <SidebarNavItem key={item.id} item={item} />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function SidebarNavItem({ item }: { item: NavItem }) {
  const { isMobile, setOpenMobile } = useSidebar()
  const { pathname } = useLocation()
  const Icon = item.icon
  // Section-aware highlight: deep pages (a publisher record, a territory
  // sheet) keep their owning entry lit even though NavLink's exact `end`
  // match no longer applies.
  const isActive = item.match ? isNavItemActive(item, pathname, false) : undefined

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} className="min-h-[44px] md:min-h-0">
        <NavLink
          to={item.to}
          end={item.end}
          onClick={() => {
            if (isMobile) setOpenMobile(false)
          }}
        >
          <Icon />
          <span>{item.label()}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
