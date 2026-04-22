import { Outlet } from 'react-router'
import { AppSidebar, type AppSidebarPermissions } from '~/shared/ui/AppSidebar'
import { NavigationProgress } from '~/shared/ui/NavigationProgress'
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
        <NavigationProgress />
        <div className="flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </div>
        <SidebarTrigger className="fixed bottom-4 left-4 z-30 size-9 rounded-full border bg-background shadow-md max-sm:bottom-3 max-sm:left-3 max-sm:size-8 md:absolute" />
      </SidebarInset>
      <Toaster richColors position="top-right" />
    </SidebarProvider>
  )
}
