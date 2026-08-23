import { Ellipsis } from 'lucide-react'
import { NavLink, useLocation } from 'react-router'

import * as m from '~/i18n/paraglide/messages'
import {
  buildTabBar,
  hasManagementSections,
  isNavItemActive,
  type NavigationPermissions,
} from '~/shared/ui/navigation-config'
import { cn } from '~/shared/utils/utils'

interface BottomTabBarProps {
  permissions: NavigationPermissions
  onMoreClick: () => void
  moreOpen: boolean
}

/**
 * Mobile-only bottom tab bar (hidden at md+). The personal tabs are the same
 * for every member; a "Plus" tab appears only for responsibility-holders and
 * opens the management sheet.
 */
export function BottomTabBar({ permissions, onMoreClick, moreOpen }: BottomTabBarProps) {
  const tabs = buildTabBar(permissions)
  const showMore = hasManagementSections(permissions)
  const { pathname } = useLocation()

  return (
    <nav
      aria-label={m.nav_primary()}
      className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden"
    >
      {tabs.map(tab => (
        <NavLink
          key={tab.id}
          to={tab.to}
          end={tab.end}
          viewTransition
          className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-muted-foreground transition-colors"
        >
          {({ isActive }) => {
            const active = isNavItemActive(tab, pathname, isActive)
            return (
              <>
                <span
                  className={cn(
                    'flex items-center justify-center rounded-full px-4 py-0.5 transition-colors',
                    active && 'bg-primary/10',
                  )}
                >
                  <tab.icon className={cn('size-5', active && 'text-primary')} aria-hidden="true" />
                </span>
                <span className={cn('whitespace-nowrap text-[11px] leading-tight', active && 'text-primary')}>
                  {tab.label()}
                </span>
              </>
            )
          }}
        </NavLink>
      ))}

      {showMore && (
        <button
          type="button"
          onClick={onMoreClick}
          aria-expanded={moreOpen}
          className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-muted-foreground transition-colors"
        >
          <span
            className={cn(
              'flex items-center justify-center rounded-full px-4 py-0.5 transition-colors',
              moreOpen && 'bg-primary/10',
            )}
          >
            <Ellipsis className={cn('size-5', moreOpen && 'text-primary')} aria-hidden="true" />
          </span>
          <span className={cn('whitespace-nowrap text-[11px] leading-tight', moreOpen && 'text-primary')}>
            {m.nav_more()}
          </span>
        </button>
      )}
    </nav>
  )
}
