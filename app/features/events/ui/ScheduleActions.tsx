import { Callout } from '@unitae/ui'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useFetcher } from 'react-router'
import { SCHEDULE_NAME_MAX } from '~/features/events/schemas/schedule-name.schema'
import * as m from '~/i18n/paraglide/messages'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/shared/ui/alert-dialog'
import { Button } from '~/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/shared/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/shared/ui/dropdown-menu'
import { useCloseOnSave } from '~/shared/ui/hooks/use-close-on-save'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { SubmitButton } from '~/shared/ui/SubmitButton'

interface ScheduleActionsProps {
  eventId: number
  schedule: { id: number; title: string; published: boolean }
  /** How many assignments the schedule holds: cancelled when a published one is deleted (D41). */
  assignments: number
}

/** A schedule's « … »: renaming it for this meeting (D44) and deleting it (D41), for « Gérer » or its responsible. */
export function ScheduleActions({ eventId, schedule, assignments }: ScheduleActionsProps) {
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null)
  const base = `/programs/events/${eventId}/schedules/${schedule.id}`
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="max-md:size-11"
            aria-label={m.programs_schedule_actions({ name: schedule.title })}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog('rename')}>
            <Pencil />
            {m.programs_schedule_rename()}
          </DropdownMenuItem>
          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDialog('delete')}>
            <Trash2 />
            {m.programs_schedule_delete()}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <RenameScheduleDialog
        open={dialog === 'rename'}
        onClose={() => setDialog(null)}
        action={`${base}/rename`}
        name={schedule.title}
      />
      <DeleteScheduleDialog
        open={dialog === 'delete'}
        onClose={() => setDialog(null)}
        action={`${base}/delete`}
        title={schedule.title}
        warning={
          schedule.published && assignments > 0 ? m.programs_schedule_delete_warning({ count: assignments }) : null
        }
      />
    </>
  )
}

function RenameScheduleDialog({
  open,
  onClose,
  action,
  name,
}: {
  open: boolean
  onClose: () => void
  action: string
  name: string
}) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>()
  useCloseOnSave(fetcher, onClose)
  const [value, setValue] = useState(name)
  const [wasOpen, setWasOpen] = useState(open)
  // Each opening starts from the schedule's current name.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setValue(name)
  }
  // Saving the name it already has would record a rename of nothing.
  const unchanged = value.trim() === name.trim() || value.trim() === ''
  const error = fetcher.state === 'idle' && fetcher.data?.ok === false ? fetcher.data.error : undefined
  return (
    <Dialog open={open} onOpenChange={next => !next && onClose()}>
      <DialogContent>
        <fetcher.Form method="post" action={action} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{m.programs_schedule_rename_title()}</DialogTitle>
            <DialogDescription>{m.programs_schedule_rename_body()}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${action}-name`}>{m.programs_schedule_name()}</Label>
            <Input
              id={`${action}-name`}
              name="name"
              value={value}
              onChange={event => setValue(event.target.value)}
              required
              maxLength={SCHEDULE_NAME_MAX}
              aria-invalid={error != null}
            />
          </div>
          {error && (
            <Callout tone="danger" role="alert">
              {error}
            </Callout>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {m.common_cancel()}
            </Button>
            <SubmitButton disabled={unchanged || fetcher.state !== 'idle'}>{m.common_save()}</SubmitButton>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  )
}

function DeleteScheduleDialog({
  open,
  onClose,
  action,
  title,
  warning,
}: {
  open: boolean
  onClose: () => void
  action: string
  title: string
  warning: string | null
}) {
  const fetcher = useFetcher<{ ok: boolean }>()
  useCloseOnSave(fetcher, onClose)
  return (
    <AlertDialog open={open} onOpenChange={next => !next && onClose()}>
      <AlertDialogContent>
        <fetcher.Form method="post" action={action} className="flex flex-col gap-4">
          <AlertDialogHeader>
            <AlertDialogTitle>{m.programs_schedule_delete_title({ name: title })}</AlertDialogTitle>
            <AlertDialogDescription>{m.programs_schedule_delete_body()}</AlertDialogDescription>
          </AlertDialogHeader>
          {warning && <Callout tone="warning">{warning}</Callout>}
          <AlertDialogFooter>
            <AlertDialogCancel type="button">{m.common_cancel()}</AlertDialogCancel>
            <SubmitButton variant="destructive" disabled={fetcher.state !== 'idle'}>
              <Trash2 />
              {m.programs_schedule_delete()}
            </SubmitButton>
          </AlertDialogFooter>
        </fetcher.Form>
      </AlertDialogContent>
    </AlertDialog>
  )
}
