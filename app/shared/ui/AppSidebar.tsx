import { Kbd } from '@unitae/ui'
import { Home, LayoutGrid, Search } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'

import * as m from '~/i18n/paraglide/messages'
import {
  buildManagementSections,
  buildPersonalItems,
  isNavItemCurrent,
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
  const { ref: navRef, fade, update: updateFade } = useBottomFade()

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

      <SidebarContent
        ref={navRef}
        onScroll={updateFade}
        data-fade={fade ? 'bottom' : undefined}
        className="px-1 [scrollbar-width:thin] data-[fade=bottom]:[mask-image:linear-gradient(to_bottom,black_calc(100%-2.5rem),transparent)]"
      >
        <nav aria-label={m.nav_primary()} className="flex flex-col gap-1">
          <SidebarGroup className="py-1">
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
    <SidebarGroup className="py-1">
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
  // One rule decides the current entry (deep pages keep their owning entry lit, siblings under the same address get
  // their own): NavLink's prefix matching would light two entries on a campaign page.
  const current = isNavItemCurrent(item, pathname)

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={current} className="min-h-[44px] md:min-h-0">
        <Link
          to={item.to}
          aria-current={current ? 'page' : undefined}
          onClick={() => {
            if (isMobile) setOpenMobile(false)
          }}
        >
          <Icon />
          <span>{item.label()}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

/**
 * Whether the entries go on below the visible part of the sidebar: the list then fades out at the bottom, so a cut
 * entry reads as « more below », not as missing (overlay scrollbars show nothing at rest).
 */
function useBottomFade() {
  const ref = useRef<HTMLDivElement>(null)
  const [fade, setFade] = useState(false)
  const update = useCallback(() => {
    const element = ref.current
    if (element == null) return
    setFade(element.scrollTop + element.clientHeight < element.scrollHeight - 1)
  }, [])
  useEffect(() => {
    const element = ref.current
    if (element == null) return
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    for (const child of element.children) observer.observe(child)
    return () => observer.disconnect()
  }, [update])
  return { ref, fade, update }
}
