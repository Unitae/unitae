import {
  Building2,
  CalendarCheck,
  CalendarDays,
  CalendarOff,
  ChevronDown,
  ClipboardList,
  FileText,
  FolderOpen,
  HardDrive,
  Home,
  LayoutGrid,
  LogOut,
  Map as MapIcon,
  MapPin,
  PieChart,
  Search,
  Settings,
  User,
  UserCog,
  UserRoundCog,
  Users,
  UsersRound,
} from 'lucide-react'
import { Form, NavLink } from 'react-router'

import * as m from '~/paraglide/messages'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/shared/ui/collapsible'
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

export interface AppSidebarPermissions {
  canViewBoard: boolean
  canUploadDocument: boolean
  canManageBoard: boolean
  canViewPublishers: boolean
  canViewTerritories: boolean
  canViewProspection: boolean
  canManageTerritories: boolean
  canManageSettings: boolean
  canManageUsers: boolean
  canViewPrograms: boolean
  canViewActivity: boolean
  canViewExternalSpeakers: boolean
  canManageExternalSpeakers: boolean
  isPlatformAdmin: boolean
}

interface AppSidebarProps {
  permissions: AppSidebarPermissions
  congregationName?: string
  onSearchClick?: () => void
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: sidebar with many permission-based conditional sections
export function AppSidebar({ permissions, congregationName, onSearchClick }: AppSidebarProps) {
  const showAssemblee =
    permissions.canViewPublishers || permissions.canViewPrograms || permissions.canViewExternalSpeakers
  const showTerritories =
    permissions.canViewTerritories || permissions.canViewProspection || permissions.canManageTerritories
  const showReglages = permissions.canManageSettings || permissions.canManageUsers

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
              <SidebarNavItem to="/" icon={Home} label={m.sidebar_home()} end />
              {permissions.canViewBoard && !permissions.canManageBoard && (
                <SidebarNavItem to="/board" icon={LayoutGrid} label={m.sidebar_board()} />
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {permissions.canManageBoard && (
          <Collapsible defaultOpen className="group/collapsible">
            <SidebarGroup>
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger>
                  {m.sidebar_board()}
                  <ChevronDown className="ml-auto size-3 transition-transform duration-200 group-data-[state=closed]/collapsible:-rotate-90" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarNavItem to="/board" icon={LayoutGrid} label={m.sidebar_board()} end />
                    <SidebarNavItem to="/board/sections" icon={FolderOpen} label={m.sidebar_sections()} />
                    <SidebarNavItem to="/board/documents" icon={FileText} label={m.sidebar_documents()} />
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        {showAssemblee && (
          <Collapsible defaultOpen className="group/collapsible">
            <SidebarGroup>
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger>
                  {m.sidebar_assembly()}
                  <ChevronDown className="ml-auto size-3 transition-transform duration-200 group-data-[state=closed]/collapsible:-rotate-90" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {permissions.canViewPublishers && (
                      <SidebarNavItem to="/publishers" icon={Users} label={m.sidebar_publishers()} />
                    )}
                    {permissions.canViewPublishers && (
                      <SidebarNavItem to="/groups" icon={UsersRound} label={m.sidebar_publisher_groups()} />
                    )}
                    {permissions.canViewPrograms && (
                      <SidebarNavItem to="/programs" icon={CalendarDays} label={m.sidebar_programs()} end />
                    )}
                    {permissions.canViewExternalSpeakers && (
                      <SidebarNavItem
                        to="/programs/external-speakers"
                        icon={UserCog}
                        label={m.sidebar_external_speakers()}
                      />
                    )}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        {showTerritories && (
          <Collapsible defaultOpen className="group/collapsible">
            <SidebarGroup>
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger>
                  {m.sidebar_territories()}
                  <ChevronDown className="ml-auto size-3 transition-transform duration-200 group-data-[state=closed]/collapsible:-rotate-90" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {permissions.canViewTerritories && (
                      <SidebarNavItem
                        to="/territories/attributions"
                        icon={CalendarCheck}
                        label={m.sidebar_attributions()}
                      />
                    )}
                    {permissions.canViewTerritories && (
                      <SidebarNavItem to="/territories" icon={MapIcon} label={m.sidebar_territories()} end />
                    )}
                    {permissions.canViewProspection && (
                      <SidebarNavItem to="/territories/buildings" icon={Building2} label={m.sidebar_prospection()} />
                    )}
                    {permissions.canManageTerritories && (
                      <SidebarNavItem to="/territories/stats" icon={PieChart} label={m.sidebar_statistics()} />
                    )}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        {showReglages && (
          <Collapsible defaultOpen className="group/collapsible">
            <SidebarGroup>
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger>
                  {m.sidebar_settings()}
                  <ChevronDown className="ml-auto size-3 transition-transform duration-200 group-data-[state=closed]/collapsible:-rotate-90" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {permissions.canManageSettings && (
                      <SidebarNavItem to="/settings/general" icon={Settings} label={m.sidebar_settings_general()} />
                    )}
                    {permissions.canManageUsers && (
                      <SidebarNavItem to="/settings/users" icon={UserCog} label={m.sidebar_users()} />
                    )}
                    {permissions.canManageSettings && (
                      <>
                        <SidebarNavItem
                          to="/settings/congregation"
                          icon={Building2}
                          label={m.sidebar_settings_assembly()}
                        />
                        <SidebarNavItem
                          to="/settings/territories"
                          icon={MapIcon}
                          label={m.sidebar_settings_territories()}
                        />
                        <SidebarNavItem to="/settings/data" icon={HardDrive} label={m.sidebar_settings_data()} />
                        <SidebarNavItem to="/settings/audit-log" icon={ClipboardList} label={m.sidebar_audit_log()} />
                      </>
                    )}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        {permissions.isPlatformAdmin && (
          <Collapsible defaultOpen className="group/collapsible">
            <SidebarGroup>
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger>
                  {m.sidebar_platform()}
                  <ChevronDown className="ml-auto size-3 transition-transform duration-200 group-data-[state=closed]/collapsible:-rotate-90" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarNavItem to="/platform-admin" icon={UserRoundCog} label={m.sidebar_administration()} />
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}
      </SidebarContent>

      <SidebarFooter className="border-sidebar-border border-t">
        <SidebarMenu>
          <SidebarNavItem to="/me/profile" icon={User} label={m.sidebar_my_profile()} />
          <SidebarNavItem to="/me/territories" icon={MapPin} label={m.sidebar_my_territories()} />
          <SidebarNavItem to="/me/days-off" icon={CalendarOff} label={m.sidebar_my_absences()} />
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

function SidebarNavItem({
  to,
  icon: Icon,
  label,
  end,
}: {
  to: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  end?: boolean
}) {
  const { isMobile, setOpenMobile } = useSidebar()

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild className="min-h-[44px] md:min-h-0">
        <NavLink
          to={to}
          end={end}
          onClick={() => {
            if (isMobile) setOpenMobile(false)
          }}
        >
          <Icon className="size-4" />
          <span>{label}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
