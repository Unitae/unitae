import { Status } from '@unitae/ui'

import { conflictWarning } from '~/features/events/model/absence'
import type { UserConflictInRange } from '~/features/events/server/list-user-conflicts-in-range.server'
import * as m from '~/i18n/paraglide/messages'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/shared/ui/alert-dialog'
import { DateChip } from '~/shared/ui/DateChip'

interface DayOffConflictModalProps {
  conflicts: UserConflictInRange[]
  timezone: string
  open: boolean
  onClose: () => void
}

/** Once an absence is saved: the assignments falling during it, and whom to warn for each. */
export function DayOffConflictModal({ conflicts, timezone, open, onClose }: DayOffConflictModalProps) {
  const count = conflicts.length
  return (
    <AlertDialog open={open} onOpenChange={next => (!next ? onClose() : undefined)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <Status tone="success" className="text-foreground">
            {m.days_off_saved_status()}
          </Status>
          <AlertDialogTitle>
            {count > 1 ? m.days_off_conflict_title_other({ count }) : m.days_off_conflict_title_one({ count })}
          </AlertDialogTitle>
          <AlertDialogDescription>{m.days_off_conflict_description()}</AlertDialogDescription>
        </AlertDialogHeader>

        <ul className="overflow-hidden rounded-lg border border-border">
          {conflicts.map(conflict => (
            <li
              key={`${conflict.assignmentName}-${new Date(conflict.eventDate).getTime()}`}
              className="flex items-center gap-3 border-border border-b px-3 py-2.5 last:border-b-0"
            >
              <DateChip date={conflict.eventDate} timeZone={timezone} />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium text-sm">{conflict.assignmentName}</span>
                <span className="text-faint text-sm">{conflictWarning(conflict, timezone)}</span>
              </span>
            </li>
          ))}
        </ul>

        <AlertDialogFooter>
          <AlertDialogAction onClick={onClose}>{m.days_off_conflict_modal_button()}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
