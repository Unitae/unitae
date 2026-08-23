import { CalendarPlus, FilePlus2, MapPin, UserPlus } from 'lucide-react'
import { Link } from 'react-router'

import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'

interface QuickActionsProps {
  canAssignTerritory: boolean
  canCreatePublisher: boolean
  canUploadDocument: boolean
  canCreateProgram: boolean
}

/**
 * Permission-aware quick actions in the dashboard hero. Everyone can plan an
 * absence; responsibility-holders get their most frequent creation shortcuts.
 * Scrolls horizontally on phones instead of wrapping into a tall block.
 */
export function QuickActions({
  canAssignTerritory,
  canCreatePublisher,
  canUploadDocument,
  canCreateProgram,
}: QuickActionsProps) {
  return (
    <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
      <QuickAction to="/me/days-off/new" icon={CalendarPlus} label={m.dashboard_plan_absence()} />
      {canAssignTerritory && (
        <QuickAction
          to="/territories/attributions/new/available-territories"
          icon={MapPin}
          label={m.dashboard_quick_action_assign_territory()}
        />
      )}
      {canCreatePublisher && (
        <QuickAction to="/publishers/new" icon={UserPlus} label={m.dashboard_quick_action_new_publisher()} />
      )}
      {canUploadDocument && (
        <QuickAction to="/board/documents/new" icon={FilePlus2} label={m.dashboard_quick_action_new_document()} />
      )}
      {canCreateProgram && (
        <QuickAction to="/programs/new" icon={CalendarPlus} label={m.dashboard_quick_action_new_program()} />
      )}
    </div>
  )
}

function QuickAction({ to, icon: Icon, label }: { to: string; icon: typeof MapPin; label: string }) {
  return (
    <Button variant="outline" size="sm" asChild className="shrink-0">
      <Link to={to}>
        <Icon className="size-4" />
        {label}
      </Link>
    </Button>
  )
}
