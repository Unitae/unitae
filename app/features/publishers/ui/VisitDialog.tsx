import { useState } from 'react'
import { useFetcher } from 'react-router'

import { formatCalendarDay } from '~/features/publishers/model/calendar-day'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { Button } from '~/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/shared/ui/dialog'
import { useCloseOnSave } from '~/shared/ui/hooks/use-close-on-save'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'

import { formErrorsOf } from './enrolment-form-errors'

export interface VisitTarget {
  publisherId: number
  name: string
  /** The last visit noted, a calendar day stored at UTC midnight. */
  lastVisit: Date | null
}

interface VisitDialogProps {
  target: VisitTarget | null
  /** Today on the congregation's calendar: the latest a visit can be dated, and the date the dialog starts on. */
  today: string
  onClose: () => void
}

/** Note the date of a pastoral visit, or clear it: only the last one is kept, without notes. */
export function VisitDialog({ target, today, onClose }: VisitDialogProps) {
  return (
    <Dialog open={target != null} onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        {target && <VisitForm target={target} today={today} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function VisitForm({ target, today, onClose }: { target: VisitTarget; today: string; onClose: () => void }) {
  const fetcher = useFetcher()
  useCloseOnSave(fetcher, onClose)
  const [day, setDay] = useState(today)
  const errors = formErrorsOf(fetcher.data)
  const busy = fetcher.state !== 'idle'
  const action = `/publishers/${target.publisherId}/pastoral-visit`

  return (
    <fetcher.Form method="post" action={action} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{m.publishers_visit_dialog_title()}</DialogTitle>
        <DialogDescription>{m.publishers_visit_dialog_description({ name: target.name })}</DialogDescription>
      </DialogHeader>
      <input type="hidden" name="intent" value="save" />
      <div className="flex flex-col gap-2">
        <Label htmlFor="visit-on">{m.publishers_visit_date_label()}</Label>
        <Input
          id="visit-on"
          name="visitedOn"
          type="date"
          max={today}
          required
          value={day}
          onChange={event => setDay(event.target.value)}
        />
        {target.lastVisit && (
          <p className="text-faint text-xs">
            {m.publishers_visit_previous({ date: formatCalendarDay(target.lastVisit, getLocale()) })}
          </p>
        )}
      </div>
      {errors.length > 0 && (
        <p role="alert" className="text-destructive text-sm">
          {errors.join(' ')}
        </p>
      )}
      <DialogFooter className="sm:justify-between">
        {target.lastVisit ? (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive"
            disabled={busy}
            onClick={() => fetcher.submit({ intent: 'clear' }, { method: 'post', action })}
          >
            {m.publishers_visit_clear()}
          </Button>
        ) : (
          <span />
        )}
        <span className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {m.common_cancel()}
          </Button>
          <Button type="submit" disabled={busy}>
            {m.common_save()}
          </Button>
        </span>
      </DialogFooter>
    </fetcher.Form>
  )
}
