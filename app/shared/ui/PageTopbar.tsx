import { PanelLeft, Search } from 'lucide-react'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { type BreadcrumbEntry, PageBreadcrumb } from '~/shared/ui/PageBreadcrumb'
import { useShell } from '~/shared/ui/shell-context'
import { useOptionalSidebar } from '~/shared/ui/sidebar'
import { cn } from '~/shared/utils/utils'

interface PageTopbarProps {
  /** The page's crumbs, the last one being the page itself. Its sidebar group is prepended from the URL. */
  trail: BreadcrumbEntry[]
  actions?: React.ReactNode
  /** The page's heading, under the bar; on a phone, between the trail and the actions. */
  children?: React.ReactNode
  className?: string
}

/**
 * The bar at the top of a page: its trail, its actions and, while the sidebar is
 * collapsed, what brings it back. From md up it spans the whole content area, from
 * the sidebar to the window's edge, whatever column the page narrows itself to: it
 * is positioned against the shell's content wrapper, so nothing between the two may
 * be positioned. On a phone it is not a bar: the trail, the heading and the actions
 * stack in that order, from the same DOM.
 *
 * Its `data-page-topbar` marker tells the shell to drop its own collapsed-sidebar
 * row, which only pages without a top bar still need.
 */
export function PageTopbar({ trail, actions, children, className }: PageTopbarProps) {
  return (
    <header data-page-topbar className={cn('mb-6 flex flex-col gap-3 md:pt-12', className)}>
      <div className="max-md:contents md:absolute md:inset-x-0 md:top-0 md:flex md:h-12 md:items-center md:gap-2 md:border-b md:px-6">
        <CollapsedSidebarControls />
        <PageBreadcrumb items={trail} className="max-md:order-1 md:flex-1" />
        {actions && (
          <div className="flex flex-wrap items-center gap-2 max-md:order-3 max-sm:w-full md:shrink-0">{actions}</div>
        )}
      </div>
      {children && <div className="max-md:order-2">{children}</div>}
    </header>
  )
}

function CollapsedSidebarControls() {
  const sidebar = useOptionalSidebar()
  const shell = useShell()
  if (sidebar?.state !== 'collapsed') return null

  return (
    <div className="-ml-1.5 flex items-center gap-0.5 max-md:hidden">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={sidebar.toggleSidebar}
        aria-label={m.shell_expand_sidebar()}
        className="text-muted-foreground"
      >
        <PanelLeft className="size-4" aria-hidden="true" />
      </Button>
      {shell && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={shell.openSearch}
          aria-label={m.sidebar_search()}
          className="text-muted-foreground"
        >
          <Search className="size-4" aria-hidden="true" />
        </Button>
      )}
      <span className="mx-1.5 h-4 w-px bg-border" aria-hidden="true" />
    </div>
  )
}
