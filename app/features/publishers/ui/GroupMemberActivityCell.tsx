import { BarChart3, Plus } from 'lucide-react'
import { Link } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { TableCell } from '~/shared/ui/table'

// One month's activity cell in the group member table: links to the existing
// report when there is one, otherwise to the pre-filled new-report form.
export function GroupMemberActivityCell({
  memberId,
  activity,
  month,
  year,
  className = 'text-center',
}: {
  memberId: number
  activity: { id: number } | null
  month: number
  year: number
  className?: string
}) {
  const to =
    activity != null
      ? `/publishers/activity/${activity.id}/edit`
      : `/publishers/activity/new?publisherId=${memberId}&month=${month}&year=${year}`

  return (
    <TableCell className={className}>
      <Button asChild variant="ghost" size="sm">
        <Link to={to} title={m.groups_view_activity_edit_title()}>
          {activity ? (
            <>
              <BarChart3 className="size-4" /> {m.groups_view_activity_view()}
            </>
          ) : (
            <>
              <Plus className="size-4" /> {m.groups_view_activity_add()}
            </>
          )}
        </Link>
      </Button>
    </TableCell>
  )
}
