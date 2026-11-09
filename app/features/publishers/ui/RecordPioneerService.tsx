import { Panel, Tag } from '@unitae/ui'
import { Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useFetcher } from 'react-router'

import type { PioneerActivity } from '~/features/publishers'
import type { EnrolmentOptions, RecordEnrolment } from '~/features/publishers/model/publisher-record.type'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/shared/ui/dialog'
import { useCloseOnSave } from '~/shared/ui/hooks/use-close-on-save'
import { cn } from '~/shared/utils/utils'

import { formErrorsOf } from './enrolment-form-errors'
import { goalLabel, monthLabel, periodLabel, serviceLabel } from './enrolment-labels'
import { type MonthRef, MonthYearField } from './MonthYearField'
import { PioneerActivitySection } from './PioneerActivitySection'

interface RecordPioneerServiceProps {
  publisherId: number
  name: string
  /** The year's pace, for readers of activity; null otherwise or when the person is no pioneer this year. */
  activity: PioneerActivity | null
  serviceYear: number
  enrolments: RecordEnrolment[]
  options: EnrolmentOptions
  canManage: boolean
  /** The enrolment open in the side panel: `new` while enrolling, its id while correcting it. */
  editing: number | 'new' | null
  /** Opens the side panel to enrol, or to correct `enrolment`. */
  onEdit: (trigger: HTMLElement, enrolment?: RecordEnrolment) => void
}

/**
 * The person's pioneer service on their record: the year's pace for readers of activity, and every enrolment, which
 * managers enrol and correct in the side panel and stop from here. A manager without the activity right still gets the
 * enrolments. While the panel is open the section is marked, and kept in view.
 */
export function RecordPioneerService({
  publisherId,
  name,
  activity,
  serviceYear,
  enrolments,
  options,
  canManage,
  editing,
  onEdit,
}: RecordPioneerServiceProps) {
  const [stopping, setStopping] = useState<RecordEnrolment | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (editing != null) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [editing])
  const current = enrolments.find(enrolment => enrolment.current)
  const list = (
    <EnrolmentList
      enrolments={enrolments}
      canManage={canManage}
      editing={editing}
      onCorrect={(enrolment, trigger) => onEdit(trigger, enrolment)}
      onStop={setStopping}
    />
  )
  const enrol = canManage && current == null && (
    <Button variant="outline" size="sm" onClick={event => onEdit(event.currentTarget)}>
      <Plus />
      {m.publishers_record_enrol()}
    </Button>
  )

  if (!activity && !canManage && enrolments.length === 0) return null
  return (
    <div ref={ref} className={cn('scroll-mt-4 rounded-lg', editing != null && 'ring-2 ring-ring')}>
      {activity ? (
        <PioneerActivitySection serviceYear={serviceYear} activity={activity} enrolments={list} enrolAction={enrol} />
      ) : (
        <Panel
          title={m.pioneers_detail_title()}
          actions={
            <>
              {current == null && <span className="text-faint text-sm">{m.publishers_record_enrolment_none()}</span>}
              {enrol}
            </>
          }
        >
          {list}
        </Panel>
      )}
      <StopDialog
        open={stopping != null}
        onClose={() => setStopping(null)}
        publisherId={publisherId}
        name={name}
        enrolment={stopping}
        options={options}
      />
    </div>
  )
}

interface EnrolmentListProps {
  enrolments: RecordEnrolment[]
  canManage: boolean
  editing: number | 'new' | null
  onCorrect: (enrolment: RecordEnrolment, trigger: HTMLElement) => void
  onStop: (enrolment: RecordEnrolment) => void
}

/** Every enrolment, the latest first, the current one marked; a manager corrects any and stops the ongoing one. */
function EnrolmentList({ enrolments, canManage, editing, onCorrect, onStop }: EnrolmentListProps) {
  if (enrolments.length === 0) return null
  const latestFirst = [...enrolments].sort(
    (a, b) => b.startYear * 12 + b.startMonth - (a.startYear * 12 + a.startMonth),
  )
  return (
    <div className="flex flex-col">
      <div className="border-border border-t px-4.5 pt-2.5 pb-1 font-medium text-faint text-xs">
        {m.publishers_record_enrolments()}
      </div>
      {latestFirst.map(enrolment => (
        <div
          key={enrolment.id}
          className={cn(
            'flex min-h-13 flex-wrap items-center gap-x-3 gap-y-1 border-border border-t px-4.5 py-2',
            editing === enrolment.id && 'bg-selected',
          )}
        >
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="font-medium">{serviceLabel(enrolment.mode)}</span>
            <span className="text-faint text-xs">
              {periodLabel(enrolment)} · {goalLabel(enrolment)}
            </span>
          </span>
          {enrolment.current && <Tag>{m.publishers_record_enrolment_current()}</Tag>}
          {canManage && (
            <span className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                aria-label={m.publishers_record_enrolment_correct_aria({
                  service: serviceLabel(enrolment.mode),
                  period: periodLabel(enrolment),
                })}
                onClick={event => onCorrect(enrolment, event.currentTarget)}
              >
                {m.publishers_record_enrolment_correct()}
              </Button>
              {enrolment.endMonth == null && (
                <Button variant="outline" size="sm" onClick={() => onStop(enrolment)}>
                  {m.publishers_record_enrolment_stop()}
                </Button>
              )}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

interface StopDialogProps {
  open: boolean
  onClose: () => void
  publisherId: number
  name: string
  enrolment: RecordEnrolment | null
  options: EnrolmentOptions
}

/** Stop the ongoing service after a month: its months stay in the history and the pioneer follow-up. */
function StopDialog({ open, onClose, publisherId, name, enrolment, options }: StopDialogProps) {
  return (
    <Dialog open={open} onOpenChange={next => !next && onClose()}>
      <DialogContent>
        {open && enrolment && (
          <StopForm onClose={onClose} publisherId={publisherId} name={name} enrolment={enrolment} options={options} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function StopForm({
  onClose,
  publisherId,
  name,
  enrolment,
  options,
}: Omit<StopDialogProps, 'open'> & { enrolment: RecordEnrolment }) {
  const fetcher = useFetcher()
  useCloseOnSave(fetcher, onClose)
  const now = options.months[0] ?? { month: enrolment.startMonth, year: enrolment.startYear }
  const [end, setEnd] = useState<MonthRef>({ month: now.month, year: now.year })
  const errors = formErrorsOf(fetcher.data)
  return (
    <fetcher.Form method="post" action={`/publishers/${publisherId}/enrolments`} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{m.publishers_record_stop_title()}</DialogTitle>
        <DialogDescription>
          {name} · {serviceLabel(enrolment.mode)} {periodLabel(enrolment)}
        </DialogDescription>
      </DialogHeader>
      <input type="hidden" name="intent" value="stop" />
      <input type="hidden" name="enrolmentId" value={enrolment.id} />
      <div className="max-w-64">
        <MonthYearField
          id="stop-end"
          label={m.publishers_record_stop_last_month()}
          names={{ month: 'endMonth', year: 'endYear' }}
          value={end}
          onChange={value => value && setEnd(value)}
          years={options.years}
        />
      </div>
      <p className="text-muted-foreground text-sm">{m.publishers_record_stop_note()}</p>
      {errors.length > 0 && (
        <p role="alert" className="text-destructive text-sm">
          {errors.join(' ')}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          {m.common_cancel()}
        </Button>
        <Button type="submit" disabled={fetcher.state !== 'idle'}>
          {m.publishers_record_stop_submit({ month: monthLabel(end.month, end.year) })}
        </Button>
      </DialogFooter>
    </fetcher.Form>
  )
}
