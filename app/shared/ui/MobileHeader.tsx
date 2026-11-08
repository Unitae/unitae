import { Search } from 'lucide-react'

import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { WorkspaceMenu } from '~/shared/ui/ShellMenus'

interface MobileHeaderProps {
  congregationName?: string
  onSearchClick: () => void
}

/**
 * Phone-only top bar (hidden at md+): the congregation's menu on the left, as in
 * the sidebar, and search on the right. Each page's trail and title follow below.
 */
export function MobileHeader({ congregationName, onSearchClick }: MobileHeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b bg-background/95 px-3 pt-[max(env(safe-area-inset-top),0.5rem)] pb-2 backdrop-blur-sm md:hidden">
      <WorkspaceMenu name={congregationName || 'Unitae'} collapsible={false} className="w-auto max-w-[70%]" />
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onSearchClick}
        aria-label={m.sidebar_search()}
        className="text-muted-foreground"
      >
        <Search className="size-4" aria-hidden="true" />
      </Button>
    </header>
  )
}
