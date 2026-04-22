import type { Blocker } from 'react-router'

import * as m from '~/paraglide/messages'
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

export function UnsavedChangesDialog({ blocker }: { blocker: Blocker }) {
  if (blocker.state !== 'blocked') return null

  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{m.common_unsaved_changes_title()}</AlertDialogTitle>
          <AlertDialogDescription>{m.common_unsaved_changes_description()}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => blocker.reset()}>{m.common_unsaved_changes_stay()}</AlertDialogCancel>
          <AlertDialogAction onClick={() => blocker.proceed()}>{m.common_unsaved_changes_leave()}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
