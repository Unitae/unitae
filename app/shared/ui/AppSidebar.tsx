import {
  Building2,
  CalendarCheck,
  CalendarOff,
  Church,
  FileText,
  FolderOpen,
  LayoutGrid,
  LogOut,
  Map,
  PieChart,
  User,
  UserRoundCog,
  Users,
  UsersRound,
} from 'lucide-react'
import { Form, NavLink } from 'react-router'

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
          <span className="truncate font-bold font-display text-lg text-foreground">
            {congregationName || 'Unitae'}
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {permissions.canViewBoard && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarNavItem to="/board" icon={LayoutGrid} label="Tableau d'affichage" />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {showDocuments && (
          <SidebarGroup>
            <SidebarGroupLabel>Documents</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarNavItem to="/board/sections" icon={FolderOpen} label="Sections" />
                <SidebarNavItem to="/board/documents" icon={FileText} label="Documents" />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {showAssemblee && (
          <SidebarGroup>
            <SidebarGroupLabel>Assemblée</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {permissions.canViewPublishers && (
                  <SidebarNavItem to="/congregation/publishers" icon={Users} label="Proclamateurs" />
                )}
                {permissions.canViewPublishers && (
                  <SidebarNavItem
                    to="/congregation/publisher-groups"
                    icon={UsersRound}
                    label="Groupes de prédication"
                  />
                )}
                {permissions.canViewPrograms && (
                  <SidebarNavItem to="/congregation/programs/days-off" icon={CalendarOff} label="Absences" />
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {showTerritories && (
          <SidebarGroup>
            <SidebarGroupLabel>Territoires</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {permissions.canViewTerritories && (
                  <SidebarNavItem to="/territories/attributions" icon={CalendarCheck} label="Attributions" />
                )}
                {permissions.canViewTerritories && (
                  <SidebarNavItem to="/territories" icon={Map} label="Territoires" end />
                )}
                {permissions.canViewProspection && (
                  <SidebarNavItem to="/territories/buildings" icon={Building2} label="Prospection" />
                )}
                {permissions.canManageTerritories && (
                  <SidebarNavItem to="/territories/stats" icon={PieChart} label="Statistiques" />
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {showReglages && (
          <SidebarGroup>
            <SidebarGroupLabel>Réglages</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {permissions.canManageUsers && (
                  <SidebarNavItem to="/settings/users" icon={Users} label="Utilisateurs" />
                )}
                {permissions.canManageSettings && (
                  <>
                    <SidebarNavItem to="/settings/territories" icon={Map} label="Réglages territoires" />
                    <SidebarNavItem to="/settings/congregation" icon={Church} label="Réglages assemblée" />
                  </>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {permissions.isPlatformAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Plateforme</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarNavItem to="/platform-admin" icon={UserRoundCog} label="Administration" />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-sidebar-border border-t">
        <SidebarMenu>
          <SidebarNavItem to="/me/profile" icon={User} label="Mon profil" />
          <SidebarNavItem to="/me/days-off" icon={CalendarOff} label="Mes absences" />
          <SidebarMenuItem>
            <div className="flex items-center justify-between">
              <Form action="/logout" method="post">
                <SidebarMenuButton type="submit" className="text-muted-foreground hover:text-destructive">
                  <LogOut className="size-4" />
                  <span>Déconnexion</span>
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
