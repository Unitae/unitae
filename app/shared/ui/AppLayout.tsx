import { Outlet } from 'react-router'
import { AppSidebar, type AppSidebarPermissions } from '~/shared/ui/AppSidebar'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '~/shared/ui/sidebar'
import { Toaster } from '~/shared/ui/sonner'

interface AppLayoutProps {
  permissions: AppSidebarPermissions
  congregationName?: string
}

export function AppLayout({ permissions, congregationName }: AppLayoutProps) {
  return (
    <SidebarProvider>
      <AppSidebar permissions={permissions} congregationName={congregationName} />
      <SidebarInset>
        <div className="flex-1 overflow-auto p-6">
          <Outlet />
        </div>
        <SidebarTrigger className="absolute bottom-4 left-4 z-30 size-9 rounded-full border bg-background shadow-md" />
      </SidebarInset>
      <Toaster richColors position="top-right" />
    </SidebarProvider>
  )
}
