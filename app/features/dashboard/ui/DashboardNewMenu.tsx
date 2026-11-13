import { CalendarOff, CalendarPlus, FileUp, type LucideIcon, MapPinned, Network, Plus, UserPlus } from 'lucide-react'
import { Link } from 'react-router'

import type { Creation, CreationKey } from '~/features/dashboard/model/dashboard-creations'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/shared/ui/dropdown-menu'

/** Each creation as the page that makes it names it. */
const ITEMS: Record<CreationKey, { label: () => string; icon: LucideIcon }> = {
  absence: { label: m.days_off_new_button, icon: CalendarOff },
  attribution: { label: m.attributions_assign_button, icon: MapPinned },
  programme: { label: m.dashboard_quick_action_new_program, icon: CalendarPlus },
  publisher: { label: m.dashboard_quick_action_new_publisher, icon: UserPlus },
  'board-document': { label: m.board_manage_upload, icon: FileUp },
  role: { label: m.org_new_role, icon: Network },
}

/**
 * « Nouveau »: what the viewer may create, from the dashboard's top bar. From md up a labelled button in the bar; on a
 * phone, `compact`, a « + » beside the greeting. Nothing to create, no button.
 */
export function DashboardNewMenu({ creations, compact = false }: { creations: Creation[]; compact?: boolean }) {
  if (creations.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compact ? (
          <Button size="icon" aria-label={m.dashboard_new_menu()}>
            <Plus aria-hidden="true" />
          </Button>
        ) : (
          <Button size="sm">
            <Plus aria-hidden="true" />
            {m.dashboard_new_menu()}
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {creations.map(creation => {
          const { label, icon: Icon } = ITEMS[creation.key]
          return (
            <DropdownMenuItem key={creation.key} asChild>
              <Link to={creation.to}>
                <Icon aria-hidden="true" />
                {label()}
              </Link>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
