import { CalendarOff, LogOut } from 'lucide-react'
import { Form, NavLink } from 'react-router'

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
 * Bottom sheet behind the mobile "Plus" tab: management sections as tappable
 * tiles, grouped like the desktop sidebar, plus the personal absences entry
 * and logout. Only rendered for members with at least one management section.
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

        <div className="flex flex-col gap-5 px-4">
          {sections.map(section => (
            <section key={section.id} aria-label={section.label()}>
              <h3 className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                {section.label()}
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {section.items.map(item => (
                  <NavLink
                    key={`${section.id}-${item.id}`}
                    to={item.to}
                    end={item.end}
                    viewTransition
                    onClick={close}
                    className={({ isActive }) =>
                      cn(
                        'flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-xl bg-muted/50 px-2 py-3 text-center transition-colors hover:bg-muted active:scale-[0.97]',
                        isActive && 'bg-primary/10 text-primary',
                      )
                    }
                  >
                    <item.icon className="size-5" aria-hidden="true" />
                    <span className="text-xs leading-tight">{item.label()}</span>
                  </NavLink>
                ))}
              </div>
            </section>
          ))}

          <div className="flex flex-col gap-1 border-t pt-3">
            <NavLink
              to="/me/days-off"
              viewTransition
              onClick={close}
              className={({ isActive }) =>
                cn(
                  'flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-sm transition-colors hover:bg-muted',
                  isActive && 'text-primary',
                )
              }
            >
              <CalendarOff className="size-4" aria-hidden="true" />
              {m.sidebar_my_absences()}
            </NavLink>
            <Form action="/logout" method="post">
              <button
                type="submit"
                className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-destructive"
              >
                <LogOut className="size-4" aria-hidden="true" />
                {m.sidebar_logout()}
              </button>
            </Form>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
