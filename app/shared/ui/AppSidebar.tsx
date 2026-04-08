import {
  BarChart3,
  Building2,
  CalendarCheck,
  CalendarOff,
  FileText,
  LayoutGrid,
  LogOut,
  Map,
  PieChart,
  Settings,
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
  SidebarSeparator,
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
  const showPrincipal =
    permissions.canViewBoard || permissions.canViewPublishers || permissions.canViewPrograms
  const showTerritories =
    permissions.canViewTerritories || permissions.canViewProspection || permissions.canManageTerritories
  const showGestion = permissions.canManageSettings || permissions.canManageUsers

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-3">
          <span className="font-display font-bold text-xl text-primary">Unitae</span>
        </div>
        {congregationName && (
          <p className="truncate px-2 pb-2 text-muted-foreground text-xs">{congregationName}</p>
        )}
      </SidebarHeader>

      <SidebarContent>
        {showPrincipal && (
          <SidebarGroup>
            <SidebarGroupLabel>Principal</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {permissions.canViewBoard && (
                  <SidebarNavItem to="/board" icon={LayoutGrid} label="Tableau d'affichage" />
                )}
                {permissions.canManageBoard && (
                  <SidebarNavItem to="/board/documents" icon={FileText} label="Documents" />
                )}
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
                {permissions.canViewActivity && (
                  <SidebarNavItem to="/congregation/publishers/activity" icon={BarChart3} label="Activité" />
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

        {showGestion && (
          <SidebarGroup>
            <SidebarGroupLabel>Gestion</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarNavItem to="/settings" icon={Settings} label="Réglages" />
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

      <SidebarSeparator />

      <SidebarFooter>
        <SidebarMenu>
          <SidebarNavItem to="/me/profile" icon={User} label="Mon profil" />
          <SidebarNavItem to="/me/days-off" icon={CalendarOff} label="Mes absences" />
          <SidebarMenuItem>
            <div className="flex items-center justify-between px-2">
              <Form action="/logout" method="post">
                <SidebarMenuButton type="submit" className="text-destructive hover:text-destructive">
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
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild>
        <NavLink to={to} end={end}>
          {({ isActive }) => (
            <>
              <Icon className="size-4" />
              <span className={isActive ? 'font-medium' : ''}>{label}</span>
            </>
          )}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
