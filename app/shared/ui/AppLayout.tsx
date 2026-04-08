import { Outlet } from 'react-router'
import { AppSidebar, type AppSidebarPermissions } from '~/shared/ui/AppSidebar'
import { Separator } from '~/shared/ui/separator'
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
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-6 shadow-[0_1px_2px_0_rgba(0,0,0,0.03)]">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </SidebarInset>
      <Toaster richColors position="top-right" />
    </SidebarProvider>
  )
}
