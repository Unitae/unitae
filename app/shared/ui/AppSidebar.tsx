import { ChevronDown, Home, LayoutGrid, LogOut, Search } from 'lucide-react'
import { Form, NavLink } from 'react-router'

import * as m from '~/i18n/paraglide/messages'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/shared/ui/collapsible'
import {
  buildManagementSections,
  buildPersonalItems,
  type NavItem,
  type NavigationPermissions,
  type NavSection,
} from '~/shared/ui/navigation-config'
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
  SidebarTrigger,
  useSidebar,
} from '~/shared/ui/sidebar'
import { ThemeToggle } from '~/shared/ui/ThemeToggle'

export type AppSidebarPermissions = NavigationPermissions

interface AppSidebarProps {
  permissions: AppSidebarPermissions
  congregationName?: string
  onSearchClick?: () => void
}

export function AppSidebar({ permissions, congregationName, onSearchClick }: AppSidebarProps) {
  const sections = buildManagementSections(permissions)
  // Members without board management see the board as a simple top-level item;
  // managers get it inside the board section instead.
  const showSimpleBoardItem = permissions.canViewBoard && !sections.some(section => section.id === 'board')

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center justify-between gap-2 border-sidebar-border border-b px-3 py-4">
          <span className="truncate font-bold font-display text-foreground text-lg">
            {congregationName || 'Unitae'}
          </span>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <SidebarTrigger className="size-7 rounded-md" />
          </div>
        </div>
        <button
          type="button"
          onClick={onSearchClick}
          className="mx-2 mt-3 mb-1 flex items-center gap-2 rounded-md border border-sidebar-border px-2 py-1 text-muted-foreground text-xs hover:bg-sidebar-accent"
        >
          <Search className="size-3.5 shrink-0" />
          <span className="flex-1 truncate text-left">{m.sidebar_search()}</span>
          <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">⌘K</kbd>
        </button>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarNavItem item={{ id: 'home', label: m.sidebar_home, icon: Home, to: '/', end: true }} />
              {showSimpleBoardItem && (
                <SidebarNavItem item={{ id: 'board', label: m.sidebar_board, icon: LayoutGrid, to: '/board' }} />
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {sections.map(section =>
          section.items.length === 1 ? (
            <SidebarGroup key={section.id}>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarNavItem item={section.items[0]} />
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ) : (
            <SidebarNavSection key={section.id} section={section} />
          ),
        )}
      </SidebarContent>

      <SidebarFooter className="border-sidebar-border border-t">
        <SidebarMenu>
          {buildPersonalItems().map(item => (
            <SidebarNavItem key={item.id} item={item} />
          ))}
          <SidebarMenuItem>
            <Form action="/logout" method="post">
              <SidebarMenuButton type="submit" className="text-muted-foreground hover:text-destructive">
                <LogOut className="size-4" />
                <span>{m.sidebar_logout()}</span>
              </SidebarMenuButton>
            </Form>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

function SidebarNavSection({ section }: { section: NavSection }) {
  return (
    <Collapsible defaultOpen className="group/collapsible">
      <SidebarGroup>
        <SidebarGroupLabel asChild>
          <CollapsibleTrigger>
            {section.label()}
            <ChevronDown className="ml-auto size-3 transition-transform duration-200 group-data-[state=closed]/collapsible:-rotate-90" />
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {section.items.map(item => (
                <SidebarNavItem key={item.id} item={item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  )
}

function SidebarNavItem({ item }: { item: NavItem }) {
  const { isMobile, setOpenMobile } = useSidebar()
  const Icon = item.icon

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild className="min-h-[44px] md:min-h-0">
        <NavLink
          to={item.to}
          end={item.end}
          onClick={() => {
            if (isMobile) setOpenMobile(false)
          }}
        >
          <Icon className="size-4" />
          <span>{item.label()}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
