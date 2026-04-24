import {
  Bell,
  Building2,
  CalendarCheck,
  CalendarDays,
  CalendarOff,
  ClipboardList,
  FileText,
  FolderOpen,
  Home,
  LayoutGrid,
  LogOut,
  Map as MapIcon,
  MapPin,
  PieChart,
  User,
  UserRoundCog,
  Users,
  UsersRound,
} from 'lucide-react'
import { Form, NavLink } from 'react-router'

import * as m from '~/paraglide/messages'
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
  isPlatformAdmin: boolean
}

interface AppSidebarProps {
  permissions: AppSidebarPermissions
  congregationName?: string
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: sidebar with many permission-based conditional sections
export function AppSidebar({ permissions, congregationName }: AppSidebarProps) {
  const showDocuments = permissions.canManageBoard
  const showAssemblee = permissions.canViewPublishers || permissions.canViewPrograms
  const showTerritories =
    permissions.canViewTerritories || permissions.canViewProspection || permissions.canManageTerritories
  const showReglages = permissions.canManageSettings || permissions.canManageUsers

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 border-sidebar-border border-b px-3 py-4">
          <span className="truncate font-bold font-display text-foreground text-lg">
            {congregationName || 'Unitae'}
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarNavItem to="/" icon={Home} label={m.sidebar_home()} end />
              {permissions.canViewBoard && <SidebarNavItem to="/board" icon={LayoutGrid} label={m.sidebar_board()} />}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {showDocuments && (
          <SidebarGroup>
            <SidebarGroupLabel>{m.sidebar_documents()}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarNavItem to="/board/sections" icon={FolderOpen} label={m.sidebar_sections()} />
                <SidebarNavItem to="/board/documents" icon={FileText} label={m.sidebar_documents()} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {showAssemblee && (
          <SidebarGroup>
            <SidebarGroupLabel>{m.sidebar_assembly()}</SidebarGroupLabel>
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
                {permissions.canViewPrograms && (
                  <SidebarNavItem to="/programs/days-off" icon={CalendarOff} label={m.sidebar_absences()} />
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {showTerritories && (
          <SidebarGroup>
            <SidebarGroupLabel>{m.sidebar_territories()}</SidebarGroupLabel>
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
          </SidebarGroup>
        )}

        {showReglages && (
          <SidebarGroup>
            <SidebarGroupLabel>{m.sidebar_settings()}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {permissions.canManageUsers && (
                  <SidebarNavItem to="/settings/users" icon={Users} label={m.sidebar_users()} />
                )}
                {permissions.canManageSettings && (
                  <>
                    <SidebarNavItem
                      to="/settings/territories"
                      icon={MapIcon}
                      label={m.sidebar_settings_territories()}
                    />
                    <SidebarNavItem
                      to="/settings/congregation"
                      icon={Building2}
                      label={m.sidebar_settings_assembly()}
                    />
                    <SidebarNavItem to="/settings/audit-log" icon={ClipboardList} label={m.sidebar_audit_log()} />
                  </>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {permissions.isPlatformAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>{m.sidebar_platform()}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarNavItem to="/platform-admin" icon={UserRoundCog} label={m.sidebar_administration()} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-sidebar-border border-t">
        <SidebarMenu>
          <SidebarNavItem to="/me/profile" icon={User} label={m.sidebar_my_profile()} />
          <SidebarNavItem to="/me/territories" icon={MapPin} label={m.sidebar_my_territories()} />
          <SidebarNavItem to="/me/days-off" icon={CalendarOff} label={m.sidebar_my_absences()} />
          <SidebarNavItem to="/me/notifications" icon={Bell} label={m.notification_preferences_page_title()} />
          <SidebarMenuItem>
            <div className="flex items-center justify-between">
              <Form action="/logout" method="post">
                <SidebarMenuButton type="submit" className="text-muted-foreground hover:text-destructive">
                  <LogOut className="size-4" />
                  <span>{m.sidebar_logout()}</span>
                </SidebarMenuButton>
              </Form>
              <ThemeToggle />
            </div>
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
