import { Trash2 } from 'lucide-react'
import { useSubmit } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '~/shared/ui/alert-dialog'
import { Button } from '~/shared/ui/button'

interface EnrolmentRemoveButtonProps {
  enrolmentId: number
  // What the manager is about to delete ("Pionnier permanent · septembre 2025"), echoed in the
  // dialog so a mis-click on the wrong history row is caught before the row is gone.
  description: string
  // History rows use the icon-only form; the current-status blocks use the labelled button.
  compact?: boolean
}

// Deletes an enrolment outright via the edit page's `remove-enrolment` intent. Distinct from
// closing a standing appointment: closing bounds a stint that really ended and keeps it in the
// history, removing erases a stint recorded in error (wrong start month, wrong type). Posts with
// useSubmit rather than a nested <Form> so it can sit inside the close-appointment form's markup.
export function EnrolmentRemoveButton({ enrolmentId, description, compact = false }: EnrolmentRemoveButtonProps) {
  const submit = useSubmit()

  function remove() {
    const formData = new FormData()
    formData.set('intent', 'remove-enrolment')
    formData.set('enrolmentId', String(enrolmentId))
    submit(formData, { method: 'post' })
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {compact ? (
          <Button type="button" variant="ghost" size="icon" title={m.publishers_enrolment_remove_title()}>
            <Trash2 className="size-4" />
            <span className="sr-only">{m.publishers_enrolment_remove()}</span>
          </Button>
        ) : (
          <Button type="button" variant="secondary">
            {m.publishers_enrolment_remove()}
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{m.publishers_enrolment_remove_confirm_title()}</AlertDialogTitle>
          <AlertDialogDescription>
            {description} — {m.publishers_enrolment_remove_confirm_description()}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={remove}>
            {m.common_delete()}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
