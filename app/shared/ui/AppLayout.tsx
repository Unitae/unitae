import { useCallback, useEffect, useState } from 'react'
import { Outlet } from 'react-router'
import { AppSidebar, type AppSidebarPermissions } from '~/shared/ui/AppSidebar'
import { BottomTabBar } from '~/shared/ui/BottomTabBar'
import { CommandPalette } from '~/shared/ui/CommandPalette'
import { MobileHeader } from '~/shared/ui/MobileHeader'
import { MoreMenuSheet } from '~/shared/ui/MoreMenuSheet'
import { NavigationProgress } from '~/shared/ui/NavigationProgress'
import { hasManagementSections } from '~/shared/ui/navigation-config'
import { OfflineBanner } from '~/shared/ui/OfflineBanner'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '~/shared/ui/sidebar'
import { Toaster } from '~/shared/ui/sonner'

interface AppLayoutProps {
  permissions: AppSidebarPermissions
  congregationName?: string
}

/**
 * Adaptive app shell. The chrome is CSS-driven so server and client render the
 * same tree: below md the sidebar is hidden and navigation happens through the
 * bottom tab bar (+ "Plus" sheet for responsibility-holders); at md+ the
 * sidebar is the only chrome.
 */
export function AppLayout({ permissions, congregationName }: AppLayoutProps) {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

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
        <MobileHeader congregationName={congregationName} onSearchClick={() => setCommandPaletteOpen(true)} />
        <div className="flex items-center p-2 max-md:hidden md:group-has-data-[state=expanded]/sidebar-wrapper:hidden">
          <SidebarTrigger className="size-8 rounded-md" />
        </div>
        <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4 max-md:pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:p-6">
          <Outlet />
        </div>
      </SidebarInset>
      <BottomTabBar permissions={permissions} onMoreClick={() => setMoreOpen(open => !open)} moreOpen={moreOpen} />
      {hasManagementSections(permissions) && (
        <MoreMenuSheet permissions={permissions} open={moreOpen} onOpenChange={setMoreOpen} />
      )}
      <Toaster richColors position="top-right" />
      <CommandPalette permissions={permissions} open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} />
    </SidebarProvider>
  )
}
