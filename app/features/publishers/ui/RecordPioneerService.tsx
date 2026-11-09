import { Panel, Tag } from '@unitae/ui'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useFetcher } from 'react-router'

import type { PioneerActivity } from '~/features/publishers'
import type { EnrolmentOptions, RecordEnrolment } from '~/features/publishers/model/publisher-record.type'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/shared/ui/dialog'
import { useCloseOnSave } from '~/shared/ui/hooks/use-close-on-save'

import { EnrolmentDialog } from './EnrolmentDialog'
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
}

type Editing =
  | { kind: 'create' }
  | { kind: 'correct'; enrolment: RecordEnrolment }
  | { kind: 'stop'; enrolment: RecordEnrolment }

/**
 * The person's pioneer service on their record: the year's pace for readers of activity, and every enrolment, which
 * managers enrol, correct and stop from here. A manager without the activity right still gets the enrolments.
 */
export function RecordPioneerService({
  publisherId,
  name,
  activity,
  serviceYear,
  enrolments,
  options,
  canManage,
}: RecordPioneerServiceProps) {
  const [editing, setEditing] = useState<Editing | null>(null)
  const current = enrolments.find(enrolment => enrolment.current)
  const list = (
    <EnrolmentList
      enrolments={enrolments}
      canManage={canManage}
      onCorrect={enrolment => setEditing({ kind: 'correct', enrolment })}
      onStop={enrolment => setEditing({ kind: 'stop', enrolment })}
    />
  )
  const enrol = canManage && current == null && (
    <Button variant="outline" size="sm" onClick={() => setEditing({ kind: 'create' })}>
      <Plus />
      {m.publishers_record_enrol()}
    </Button>
  )
  const close = () => setEditing(null)

  return (
    <>
      {activity ? (
        <PioneerActivitySection serviceYear={serviceYear} activity={activity} enrolments={list} enrolAction={enrol} />
      ) : (
        (canManage || enrolments.length > 0) && (
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
        )
      )}
      <EnrolmentDialog
        open={editing?.kind === 'create' || editing?.kind === 'correct'}
        onClose={close}
        publisherId={publisherId}
        name={name}
        options={options}
        enrolment={editing?.kind === 'correct' ? editing.enrolment : undefined}
      />
      <StopDialog
        open={editing?.kind === 'stop'}
        onClose={close}
        publisherId={publisherId}
        name={name}
        enrolment={editing?.kind === 'stop' ? editing.enrolment : null}
        options={options}
      />
    </>
  )
}

interface EnrolmentListProps {
  enrolments: RecordEnrolment[]
  canManage: boolean
  onCorrect: (enrolment: RecordEnrolment) => void
  onStop: (enrolment: RecordEnrolment) => void
}

/** Every enrolment, the latest first, the current one marked; a manager corrects any and stops the ongoing one. */
function EnrolmentList({ enrolments, canManage, onCorrect, onStop }: EnrolmentListProps) {
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
          className="flex min-h-13 flex-wrap items-center gap-x-3 gap-y-1 border-border border-t px-4.5 py-2"
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
                onClick={() => onCorrect(enrolment)}
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
