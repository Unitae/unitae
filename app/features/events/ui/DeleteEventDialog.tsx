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
 * What deleting does: the whole event, an empty meeting that will not come back (a week without a meeting), or only
 * the programme of a meeting with attendance, which stays with its counts.
 */
export type DeleteOutcome = 'everything' | 'empty-meeting' | 'programme-only'

/**
 * « Supprimer ce programme ? », from the « … » of the programme's page. Says what goes with it, then posts to the
 * programme's delete action, which goes back to the programmes list.
 */
export function DeleteEventDialog({
  event,
  outcome = 'everything',
  open,
  onClose,
}: {
  event: { id: number; name: string; date: string }
  outcome?: DeleteOutcome
  open: boolean
  onClose: () => void
}) {
  const words = {
    everything: {
      title: m.programs_delete_dialog_title(),
      description: m.programs_delete_dialog_description(event),
      submit: m.programs_delete_submit(),
    },
    'empty-meeting': {
      title: m.programs_delete_meeting_title(),
      description: m.programs_delete_meeting_description(event),
      submit: m.programs_delete_meeting_submit(),
    },
    'programme-only': {
      title: m.programs_delete_dialog_title(),
      description: m.programs_delete_programme_only_description(event),
      submit: m.programs_delete_programme_submit(),
    },
  }[outcome]
  return (
    <AlertDialog open={open} onOpenChange={next => !next && onClose()}>
      <AlertDialogContent>
        <Form method="post" action={`/programs/events/${event.id}/delete`} className="flex flex-col gap-4">
          <AlertDialogHeader>
            <AlertDialogTitle>{words.title}</AlertDialogTitle>
            <AlertDialogDescription>{words.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">{m.common_cancel()}</AlertDialogCancel>
            <SubmitButton variant="destructive">{words.submit}</SubmitButton>
          </AlertDialogFooter>
        </Form>
      </AlertDialogContent>
    </AlertDialog>
  )
}
