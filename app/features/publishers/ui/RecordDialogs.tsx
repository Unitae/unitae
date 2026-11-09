import { useState } from 'react'
import { Form } from 'react-router'

import { formatCalendarDay } from '~/features/publishers/model/calendar-day'
import type { PublisherRecord } from '~/features/publishers/server/publisher-record.queries'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
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
import { Button } from '~/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/shared/ui/dialog'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { formatGroupName } from '~/shared/utils/format-group-name'
import { formatPersonName } from '~/shared/utils/format-person-name'

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  title: string
  description: string
  confirm: string
  destructive?: boolean
  onConfirm: () => void
}

/** A yes / no question before a change of status or login. */
export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirm,
  destructive,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={next => !next && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
          <AlertDialogAction variant={destructive ? 'destructive' : 'default'} onClick={onConfirm}>
            {confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** The day a record is anonymised when its person left on `day` and does not come back. */
function anonymisationDay(day: string, retentionMonths: number) {
  const date = new Date(`${day}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return null
  date.setUTCMonth(date.getUTCMonth() + retentionMonths)
  return formatCalendarDay(date, getLocale())
}

interface LeftDialogProps {
  open: boolean
  onClose: () => void
  record: PublisherRecord
  action: string
  today: string
  earliest: string
  retentionMonths: number
}

/** « A quitté l'assemblée » : what it changes, and the day it happened, today unless said otherwise. */
export function LeftDialog({ open, onClose, record, action, today, earliest, retentionMonths }: LeftDialogProps) {
  const [day, setDay] = useState(today)
  const name = formatPersonName(record)
  const anonymised = anonymisationDay(day, retentionMonths)
  return (
    <Dialog open={open} onOpenChange={next => !next && onClose()}>
      <DialogContent>
        <Form method="post" action={action} className="flex flex-col gap-4" onSubmit={onClose}>
          <DialogHeader>
            <DialogTitle>{m.publishers_record_left_title({ name })}</DialogTitle>
            <DialogDescription className="sr-only">{m.publishers_record_left_title({ name })}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-x-3.5 gap-y-1 rounded-md bg-sidebar px-3 py-2.5 text-muted-foreground text-sm">
            <span className="font-medium text-foreground">{name}</span>
            {record.group && <span>{formatGroupName(record.group.name)}</span>}
          </div>
          <ul className="flex list-disc flex-col gap-1.5 pl-4.5 text-muted-foreground text-sm">
            <li>{m.publishers_record_left_effect_lists()}</li>
            <li>{m.publishers_record_left_effect_roles()}</li>
            {anonymised && (
              <li>{m.publishers_record_left_effect_anonymised({ date: anonymised, count: retentionMonths })}</li>
            )}
          </ul>
          <div className="flex max-w-56 flex-col gap-2">
            <Label htmlFor="left-on">{m.publishers_record_left_date()}</Label>
            <Input
              id="left-on"
              name="leftOn"
              type="date"
              min={earliest}
              max={today}
              required
              value={day}
              onChange={event => setDay(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {m.common_cancel()}
            </Button>
            <Button type="submit" variant="destructive">
              {m.publishers_view_mark_as_left_confirm()}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

interface LinkLoginDialogProps {
  open: boolean
  onClose: () => void
  action: string
  defaultEmail: string
}

/** Create a login for the person, from their contact e-mail unless another is given. */
export function LinkLoginDialog({ open, onClose, action, defaultEmail }: LinkLoginDialogProps) {
  return (
    <Dialog open={open} onOpenChange={next => !next && onClose()}>
      <DialogContent>
        <Form method="post" action={action} className="flex flex-col gap-4" onSubmit={onClose}>
          <DialogHeader>
            <DialogTitle>{m.publishers_edit_link_login_dialog_title()}</DialogTitle>
            <DialogDescription>{m.publishers_edit_link_login_dialog_description()}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="link-login-email">{m.publishers_edit_link_login_email_label()}</Label>
            <Input id="link-login-email" name="email" type="email" defaultValue={defaultEmail} required />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {m.common_cancel()}
            </Button>
            <Button type="submit">{m.publishers_edit_link_login_submit()}</Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
