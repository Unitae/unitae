import { Search } from 'lucide-react'

import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { ThemeToggle } from '~/shared/ui/ThemeToggle'

interface MobileHeaderProps {
  congregationName?: string
  onSearchClick: () => void
}

/**
 * Mobile-only top bar (hidden at md+): congregation identity on the left,
 * search and theme controls on the right. Page-level titles and back buttons
 * stay in each page's PageHeader.
 */
export function MobileHeader({ congregationName, onSearchClick }: MobileHeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b bg-background/95 px-4 pt-[max(env(safe-area-inset-top),0.5rem)] pb-2 backdrop-blur-sm md:hidden">
      <span className="truncate font-bold font-display text-foreground text-lg">{congregationName || 'Unitae'}</span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" onClick={onSearchClick} aria-label={m.sidebar_search()}>
          <Search className="size-4" />
        </Button>
        <ThemeToggle />
      </div>
    </header>
  )
}
