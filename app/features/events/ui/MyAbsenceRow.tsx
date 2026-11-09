import { Status, Tag } from '@unitae/ui'
import { CalendarOff, Trash2 } from 'lucide-react'
import { Form } from 'react-router'

import { absenceDays, absenceLength, conflictWarning, formatAbsencePeriod } from '~/features/events/model/absence'
import type { UserConflictInRange } from '~/features/events/server/list-user-conflicts-in-range.server'
import * as m from '~/i18n/paraglide/messages'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '~/shared/ui/alert-dialog'
import { Button } from '~/shared/ui/button'
import { DateChip } from '~/shared/ui/DateChip'
import { SubmitButton } from '~/shared/ui/SubmitButton'

export interface MyAbsenceRowData {
  id: number
  startDate: Date | string
  endDate: Date | string
  conflicts: UserConflictInRange[]
}

/**
 * One absence: its days and how long it lasts, whether it is under way, the assignments falling during
 * it with whom to warn, and a delete that shows the whole period before it goes.
 */
export function MyAbsenceRow({ absence, timeZone, now }: { absence: MyAbsenceRowData; timeZone: string; now: Date }) {
  const period = formatAbsencePeriod(absence.startDate, absence.endDate, timeZone, now)
  const { count } = absenceDays(absence.startDate, absence.endDate, timeZone)
  const underway = new Date(absence.startDate) <= now
  const conflicts = absence.conflicts.length

  return (
    <li className="flex items-start gap-3.5 border-border border-b py-3 pr-1 pl-3.5 last:border-b-0 md:pr-3 md:pl-4">
      <DateChip date={absence.startDate} timeZone={timeZone} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium">{period}</span>
          {underway && <Tag tone="brand">{m.days_off_underway()}</Tag>}
        </div>
        <span className="text-faint text-sm tabular-nums">{absenceLength(count)}</span>
        {conflicts > 0 && (
          <div className="mt-1.5 flex flex-col gap-1">
            <Status tone="warning" className="whitespace-normal text-foreground">
              {conflicts > 1
                ? m.days_off_conflicts_other({ count: conflicts })
                : m.days_off_conflicts_one({ count: conflicts })}
            </Status>
            <ul className="flex flex-col gap-0.5 pl-[1.125rem] text-muted-foreground text-sm">
              {absence.conflicts.map(conflict => (
                <li key={`${conflict.assignmentName}-${new Date(conflict.eventDate).getTime()}`}>
                  <span className="font-medium text-foreground">{conflict.assignmentName}</span>
                  {' · '}
                  {conflictWarning(conflict, timeZone)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <DeleteAbsence id={absence.id} period={period} length={absenceLength(count)} />
    </li>
  )
}

function DeleteAbsence({ id, period, length }: { id: number; period: string; length: string }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground max-md:size-11"
          aria-label={m.days_off_delete_aria({ period })}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{m.days_off_delete_dialog_title()}</AlertDialogTitle>
          <AlertDialogDescription>{m.days_off_delete_dialog_description()}</AlertDialogDescription>
        </AlertDialogHeader>
        <p className="flex items-center gap-2.5 rounded-md bg-sidebar px-3 py-2.5 text-sm">
          <CalendarOff aria-hidden="true" className="size-4 shrink-0 text-faint" />
          <span>
            <span className="font-medium">{period}</span> · <span className="tabular-nums">{length}</span>
          </span>
        </p>
        <AlertDialogFooter>
          <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
          <Form method="post" action={`/me/days-off/${id}/delete`}>
            <SubmitButton variant="destructive" className="w-full">
              {m.days_off_delete_submit()}
            </SubmitButton>
          </Form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
