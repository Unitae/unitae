import { Form } from 'react-router'

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
import { SubmitButton } from '~/shared/ui/SubmitButton'

/**
 * « Supprimer ce programme ? », from the « … » of the programme's page. Says what goes with it, then posts to the
 * programme's delete action, which goes back to the programmes list.
 */
export function DeleteEventDialog({
  event,
  open,
  onClose,
}: {
  event: { id: number; name: string; date: string }
  open: boolean
  onClose: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={next => !next && onClose()}>
      <AlertDialogContent>
        <Form method="post" action={`/programs/events/${event.id}/delete`} className="flex flex-col gap-4">
          <AlertDialogHeader>
            <AlertDialogTitle>{m.programs_delete_dialog_title()}</AlertDialogTitle>
            <AlertDialogDescription>
              {m.programs_delete_dialog_description({ name: event.name, date: event.date })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">{m.common_cancel()}</AlertDialogCancel>
            <SubmitButton variant="destructive">{m.programs_delete_submit()}</SubmitButton>
          </AlertDialogFooter>
        </Form>
      </AlertDialogContent>
    </AlertDialog>
  )
}
