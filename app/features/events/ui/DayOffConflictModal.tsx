import { AlertTriangle } from 'lucide-react'
import type { UserConflictInRange } from '~/features/events/server/list-user-conflicts-in-range.server'
import * as m from '~/i18n/paraglide/messages'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '~/shared/ui/alert-dialog'
import { formatEventDate } from '~/shared/utils/event-time'

interface DayOffConflictModalProps {
  conflicts: UserConflictInRange[]
  timezone: string
  open: boolean
  onClose: () => void
}

const ROW_DATE_OPTIONS: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }

export function DayOffConflictModal({ conflicts, timezone, open, onClose }: DayOffConflictModalProps) {
  const title =
    conflicts.length === 1
      ? m.days_off_conflict_modal_title_singular()
      : m.days_off_conflict_modal_title_plural({ count: conflicts.length })

  return (
    <AlertDialog open={open} onOpenChange={next => (!next ? onClose() : undefined)}>
      <AlertDialogContent>
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="inline-flex size-14 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/30 dark:text-amber-400">
            <AlertTriangle className="size-7" />
          </div>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{m.days_off_conflict_modal_intro()}</AlertDialogDescription>
        </div>

        <ul className="flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          {conflicts.map((c, idx) => {
            const date = formatEventDate(c.eventDate, timezone, 'fr-FR', ROW_DATE_OPTIONS)
            const text =
              c.responsibleName != null
                ? m.days_off_conflict_modal_row_named({
                    assignment: c.assignmentName,
                    date,
                    responsible: c.responsibleName,
                  })
                : m.days_off_conflict_modal_row_fallback({ assignment: c.assignmentName, date })
            return (
              // Conflicts have no stable id — server returns an aggregate; index is fine
              // because we never reorder within one modal instance.
              // biome-ignore lint/suspicious/noArrayIndexKey: aggregate row has no stable id
              <li key={idx} className="flex items-start gap-2">
                <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500" />
                <span>{text}</span>
              </li>
            )
          })}
        </ul>

        <AlertDialogFooter>
          <AlertDialogAction onClick={onClose}>{m.days_off_conflict_modal_button()}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
