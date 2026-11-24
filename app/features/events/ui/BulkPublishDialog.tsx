import { Send } from 'lucide-react'
import type { ReactNode } from 'react'
import type { BulkPublishPreview } from '~/features/events/model/bulk-publish-preview.type'
import { bulkPublishSummary } from '~/features/events/model/bulk-publish-summary'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { getRoleDisplayName } from '~/shared/types/role'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/shared/ui/alert-dialog'
import { formatEventDate } from '~/shared/utils/event-time'
import { scheduleTitle } from './ScheduleHeading'

/** One line of a group: what, the day, and a note (who is away, who is in charge, the slots still open). */
interface Line {
  key: string
  title: string
  day: Date | string
  note?: ReactNode
}

/**
 * Bulk « Publier » asks first (design round A, « TourA-Publier-Lot »): what will be published, and what stays a draft
 * and why, each schedule named with its day. An empty schedule stays a draft too (#617), a group the board predates.
 */
export function BulkPublishDialog({
  preview,
  selected,
  timeZone,
  busy,
  onCancel,
  onConfirm,
}: {
  preview: BulkPublishPreview | null
  /** The meetings selected: the title counts what publishes against them, not against the schedules. */
  selected: number
  timeZone: string
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  if (preview == null) return null
  const scheduleLine = (schedule: { id: number; name: string | null; kind: string; startDate: Date | string }) => ({
    key: `s${schedule.id}`,
    title: scheduleTitle(schedule),
    day: schedule.startDate,
  })
  const eventLine = (event: { id: number; name: string; startDate: Date | string }) => ({
    key: `e${event.id}`,
    title: event.name,
    day: event.startDate,
  })
  const publish: Line[] = [
    ...preview.publish.map(schedule => ({
      ...scheduleLine(schedule),
      note: schedule.unfilled > 0 ? m.programs_bulk_preview_unfilled({ count: schedule.unfilled }) : undefined,
    })),
    ...preview.events.publish.map(eventLine),
  ]
  const notYours: Line[] = [
    ...preview.notYours.map(schedule => ({
      ...scheduleLine(schedule),
      note: schedule.responsible ? getRoleDisplayName(schedule.responsible) : undefined,
    })),
    ...preview.events.notYours.map(eventLine),
  ]
  const conflicts: Line[] = preview.conflicts.map(schedule => ({
    ...scheduleLine(schedule),
    note: schedule.away.join(', '),
  }))
  const empty: Line[] = preview.empty.map(scheduleLine)
  const awaiting: Line[] = [...preview.awaiting.map(scheduleLine), ...preview.events.awaiting.map(eventLine)]
  const { publish: count, held } = bulkPublishSummary(preview)
  const day = (date: Date | string) => formatEventDate(date, timeZone, getLocale(), { day: 'numeric', month: 'short' })

  return (
    <AlertDialog open onOpenChange={open => !open && onCancel()}>
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {count === 0
              ? m.programs_bulk_preview_nothing()
              : held === 0
                ? m.programs_bulk_preview_title_all({ count })
                : m.programs_bulk_preview_title_some({ count, total: selected })}
          </AlertDialogTitle>
          <AlertDialogDescription>{m.programs_bulk_preview_body()}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-3">
          <Group lines={publish} label={m.programs_bulk_preview_publish({ count: publish.length })} day={day} />
          <Group
            lines={notYours}
            label={m.programs_bulk_preview_not_yours({ count: notYours.length })}
            hint={m.programs_bulk_preview_not_yours_hint()}
            day={day}
          />
          <Group lines={conflicts} label={m.programs_bulk_preview_conflicts({ count: conflicts.length })} day={day} />
          <Group lines={empty} label={m.programs_bulk_preview_empty({ count: empty.length })} day={day} />
          <Group lines={awaiting} label={m.programs_bulk_preview_awaiting({ count: awaiting.length })} day={day} />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{m.common_cancel()}</AlertDialogCancel>
          {count > 0 && (
            <AlertDialogAction disabled={busy} onClick={onConfirm}>
              <Send />
              {m.programs_bulk_preview_submit({ count })}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function Group({
  lines,
  label,
  hint,
  day,
}: {
  lines: Line[]
  label: string
  hint?: string
  day: (date: Date | string) => string
}) {
  if (lines.length === 0) return null
  return (
    <section className="flex flex-col gap-1.5 rounded-md border border-border px-3 py-2.5 text-sm">
      <h3 className="flex items-baseline gap-2">
        <span className="font-semibold tabular-nums">{lines.length}</span>
        <span className="text-muted-foreground">{label}</span>
      </h3>
      <ul className="flex flex-col gap-1">
        {lines.map(line => (
          <li key={line.key} className="flex flex-col">
            <span>
              {line.title} <span className="text-faint tabular-nums">· {day(line.day)}</span>
            </span>
            {line.note && <span className="text-muted-foreground text-xs">{line.note}</span>}
          </li>
        ))}
      </ul>
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </section>
  )
}
