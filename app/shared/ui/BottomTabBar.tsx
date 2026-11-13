import { Ellipsis, type LucideIcon } from 'lucide-react'
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
      // Hidden while a page shows a bottom sheet (`data-bottom-sheet`): the sheet's action
      // buttons would otherwise sit one thumb-width above five navigation targets, and a
      // mis-tap there leaves the page mid-edit. Same zero-JS `has()` trick the layout uses
      // for `data-sticky-content` and `data-full-bleed`.
      className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-surface/95 px-1 pt-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden [body:has([data-bottom-sheet])_&]:hidden"
    >
      {tabs.map(tab => (
        <NavLink key={tab.id} to={tab.to} end={tab.end} viewTransition className={TAB}>
          {({ isActive }) => (
            <TabContent icon={tab.icon} label={tab.label()} active={isNavItemActive(tab, pathname, isActive)} />
          )}
        </NavLink>
      ))}

      {showMore && (
        <button type="button" onClick={onMoreClick} aria-expanded={moreOpen} className={TAB}>
          <TabContent icon={Ellipsis} label={m.nav_more()} active={moreOpen} />
        </button>
      )}
    </nav>
  )
}

// Labels at 10px, as in iOS tab bars. Tabs take their label's width plus an equal share of what is
// left, so « Mes territoires » and « Mes absences » keep the same gap as the short ones instead of
// nearly touching in equal cells. A label wraps rather than touch its neighbour on the narrowest
// phones, and the icons stay aligned because each tab starts at the top. 44px keeps « Plus » tappable.
const TAB =
  'group/tab flex min-h-[52px] min-w-11 flex-auto flex-col items-center justify-start gap-[3px] rounded-md px-1 pt-[7px] font-medium text-[10px] text-faint leading-[1.2] transition-colors'

/** A tab: the current one in ink with its icon in the accent, the others faint. No pill. */
function TabContent({ icon: Icon, label, active }: { icon: LucideIcon; label: string; active: boolean }) {
  return (
    <>
      <Icon
        className={cn('size-[22px] transition-transform group-active/tab:scale-[0.86]', active && 'text-brand')}
        aria-hidden="true"
      />
      <span className={cn('max-w-full text-balance text-center', active && 'text-foreground')}>{label}</span>
    </>
  )
}
