import { Search } from 'lucide-react'
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
  /** Initial sidebar state, read from the persistence cookie by the layout loader. */
  sidebarOpen?: boolean
}

/**
 * Adaptive app shell. The chrome is CSS-driven so server and client render the
 * same tree: below md the sidebar is hidden and navigation happens through the
 * bottom tab bar (+ "Plus" sheet for responsibility-holders); at md+ the
 * sidebar is the only chrome.
 */
export function AppLayout({ permissions, congregationName, sidebarOpen = true }: AppLayoutProps) {
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
    <SidebarProvider defaultOpen={sidebarOpen}>
      <AppSidebar
        permissions={permissions}
        congregationName={congregationName}
        onSearchClick={() => setCommandPaletteOpen(true)}
      />
      <SidebarInset>
        <NavigationProgress />
        <OfflineBanner />
        <MobileHeader congregationName={congregationName} onSearchClick={() => setCommandPaletteOpen(true)} />
        <div className="flex items-center gap-1 p-2 max-md:hidden md:group-has-data-[state=expanded]/sidebar-wrapper:hidden">
          <SidebarTrigger className="size-8 rounded-md" />
          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            className="flex h-8 items-center gap-2 rounded-lg border px-2.5 text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Search className="size-3.5" />
            <kbd className="font-mono text-[10px]">⌘K</kbd>
          </button>
        </div>
        {/* The extra max-sm padding reacts to a docked FormActions bar
            anywhere on the page (its data-form-actions marker), reserving the
            bar's height so content can scroll clear of it. Progressive
            enhancement: browsers without :has() fall back to tab-bar-only
            clearance. */}
        <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-[radial-gradient(70%_360px_at_50%_0%,color-mix(in_oklab,var(--color-primary)_5%,transparent),transparent)] p-4 max-md:pb-[calc(4.5rem+env(safe-area-inset-bottom))] max-sm:has-[[data-form-actions]]:pb-[calc(8rem+env(safe-area-inset-bottom))] md:p-6">
          {/* Soft cap so pages keep a readable measure when the sidebar is
              collapsed or on very wide screens. Full-bleed pages — the two board viewers,
              which escape the padding with negative margins — opt out via `data-full-bleed`,
              the same zero-JS has() trick as `data-form-actions`: a capped, centred viewer
              reads as a floating column with cream gutters on a wide monitor. */}
          <div className="mx-auto w-full max-w-7xl has-[[data-full-bleed]]:max-w-none">
            <Outlet />
          </div>
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
