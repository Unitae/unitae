import { Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Outlet } from 'react-router'
import type { TrialBannerInfo } from '~/shared/domain/trial-status'
import { AppSidebar, type AppSidebarPermissions } from '~/shared/ui/AppSidebar'
import { BottomTabBar } from '~/shared/ui/BottomTabBar'
import { CommandPalette } from '~/shared/ui/CommandPalette'
import { MobileHeader } from '~/shared/ui/MobileHeader'
import { MoreMenuSheet } from '~/shared/ui/MoreMenuSheet'
import { NavigationProgress } from '~/shared/ui/NavigationProgress'
import { hasManagementSections } from '~/shared/ui/navigation-config'
import { OfflineBanner } from '~/shared/ui/OfflineBanner'
import { ShellProvider } from '~/shared/ui/shell-context'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '~/shared/ui/sidebar'
import { Toaster } from '~/shared/ui/sonner'
import { TrialBanner } from '~/shared/ui/TrialBanner'

interface AppLayoutProps {
  permissions: AppSidebarPermissions
  congregationName?: string
  /** The signed-in person's name, at the foot of the sidebar. */
  userName: string
  /** The congregation's SaaS trial, when it is in one: shown as a banner above every page. */
  trial?: TrialBannerInfo | null
  /** Initial sidebar state, read from the persistence cookie by the layout loader. */
  sidebarOpen?: boolean
}

/**
 * Adaptive app shell. The chrome is CSS-driven so server and client render the
 * same tree: below md the sidebar is hidden and navigation happens through the
 * bottom tab bar (+ "Plus" sheet for responsibility-holders); at md+ the
 * sidebar is the only chrome.
 */
export function AppLayout({
  permissions,
  congregationName,
  userName,
  trial = null,
  sidebarOpen = true,
}: AppLayoutProps) {
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

  const shell = useMemo(() => ({ openSearch: () => setCommandPaletteOpen(true) }), [])

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <AppSidebar
        permissions={permissions}
        congregationName={congregationName}
        userName={userName}
        onSearchClick={shell.openSearch}
      />
      <SidebarInset className="group/inset">
        <NavigationProgress />
        <OfflineBanner />
        <TrialBanner trial={trial} />
        <MobileHeader congregationName={congregationName} userName={userName} onSearchClick={shell.openSearch} />
        {/* Brings a collapsed sidebar back on pages without a top bar; a page's
            PageTopbar carries these controls itself. */}
        <div className="flex items-center gap-1 p-2 max-md:hidden group-has-[[data-page-topbar]]/inset:hidden md:group-has-data-[state=expanded]/sidebar-wrapper:hidden">
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
            clearance. A page carrying data-sticky-content needs position:
            sticky: the document scrolls, never this wrapper, yet its overflow
            makes it the sticky containment root. Clipping instead still keeps
            wide content from widening the page. It is also what a page's
            PageTopbar is positioned against, to span the whole content area. */}
        <div className="relative min-w-0 flex-1 overflow-y-auto overflow-x-hidden has-[[data-sticky-content]]:overflow-x-clip has-[[data-sticky-content]]:overflow-y-visible p-4 max-md:pb-[calc(4.5rem+env(safe-area-inset-bottom))] max-sm:has-[[data-form-actions]]:pb-[calc(8rem+env(safe-area-inset-bottom))] md:p-6">
          {/* Soft cap so pages keep a readable measure when the sidebar is
              collapsed or on very wide screens. Full-bleed pages — the two board viewers,
              which escape the padding with negative margins — opt out via `data-full-bleed`,
              the same zero-JS has() trick as `data-form-actions`: a capped, centred viewer
              reads as a floating column with cream gutters on a wide monitor. */}
          <div className="mx-auto w-full max-w-7xl has-[[data-full-bleed]]:max-w-none">
            <ShellProvider value={shell}>
              <Outlet />
            </ShellProvider>
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
