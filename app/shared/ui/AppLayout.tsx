import { Outlet } from 'react-router'
import { Toaster } from '~/shared/ui/sonner'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '~/shared/ui/sidebar'
import { Separator } from '~/shared/ui/separator'
import { AppSidebar, type AppSidebarPermissions } from '~/shared/ui/AppSidebar'

interface AppLayoutProps {
  permissions: AppSidebarPermissions
  congregationName?: string
}

export function AppLayout({ permissions, congregationName }: AppLayoutProps) {
  return (
    <SidebarProvider>
      <AppSidebar permissions={permissions} congregationName={congregationName} />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </SidebarInset>
      <Toaster richColors position="top-right" />
    </SidebarProvider>
  )
}
