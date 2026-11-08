import type { LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router'

import * as m from '~/i18n/paraglide/messages'
import { buildManagementSections, type NavigationPermissions } from '~/shared/ui/navigation-config'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '~/shared/ui/sheet'
import { cn } from '~/shared/utils/utils'

interface MoreMenuSheetProps {
  permissions: NavigationPermissions
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Bottom sheet behind the mobile "Plus" tab: management sections as rows,
 * grouped like the desktop sidebar. Personal pages are tabs, and the profile and
 * signing out sit in the header's account menu. Only rendered for members with at
 * least one management section.
 */
export function MoreMenuSheet({ permissions, open, onOpenChange }: MoreMenuSheetProps) {
  const sections = buildManagementSections(permissions)
  const close = () => onOpenChange(false)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[80dvh] gap-0 overflow-y-auto rounded-t-2xl pb-[max(env(safe-area-inset-bottom),1rem)] md:hidden"
      >
        <SheetHeader className="pb-1">
          <SheetTitle>{m.nav_more()}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-2">
          {sections.map(section => (
            <section key={section.id} aria-label={section.label()}>
              <h3 className="px-3 pb-1 font-medium text-faint text-xs">{section.label()}</h3>
              <ul className="flex flex-col gap-px">
                {section.items.map(item => (
                  <li key={`${section.id}-${item.id}`}>
                    <SheetLink to={item.to} end={item.end} icon={item.icon} onNavigate={close}>
                      {item.label()}
                    </SheetLink>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}

const ROW =
  'flex min-h-[44px] items-center gap-3 rounded-md px-3 font-medium text-muted-foreground text-sm transition-colors hover:bg-hover hover:text-foreground'

function SheetLink({
  to,
  end,
  icon: Icon,
  onNavigate,
  children,
}: {
  to: string
  end?: boolean
  icon: LucideIcon
  onNavigate: () => void
  children: React.ReactNode
}) {
  return (
    <NavLink
      to={to}
      end={end}
      viewTransition
      onClick={onNavigate}
      className={({ isActive }) => cn(ROW, isActive && 'bg-selected text-foreground')}
    >
      {({ isActive }) => (
        <>
          <Icon className={cn('size-4 text-faint', isActive && 'text-brand')} aria-hidden="true" />
          {children}
        </>
      )}
    </NavLink>
  )
}
