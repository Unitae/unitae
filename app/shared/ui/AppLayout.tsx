import { useCallback, useEffect, useState } from 'react'
import { Outlet } from 'react-router'
import { AppSidebar, type AppSidebarPermissions } from '~/shared/ui/AppSidebar'
import { CommandPalette } from '~/shared/ui/CommandPalette'
import { NavigationProgress } from '~/shared/ui/NavigationProgress'
import { OfflineBanner } from '~/shared/ui/OfflineBanner'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '~/shared/ui/sidebar'
import { Toaster } from '~/shared/ui/sonner'

interface AppLayoutProps {
  permissions: AppSidebarPermissions
  congregationName?: string
}

export function AppLayout({ permissions, congregationName }: AppLayoutProps) {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      setCommandPaletteOpen(open => !open)
    }
  }, [])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <SidebarProvider>
      <AppSidebar
        permissions={permissions}
        congregationName={congregationName}
        onSearchClick={() => setCommandPaletteOpen(true)}
      />
      <SidebarInset>
        <NavigationProgress />
        <OfflineBanner />
        <header className="flex items-center gap-2 p-2 md:p-3">
          <SidebarTrigger className="size-8 rounded-md" />
        </header>
        <div className="flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </div>
      </SidebarInset>
      <Toaster richColors position="top-right" />
      <CommandPalette permissions={permissions} open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} />
    </SidebarProvider>
  )
}
