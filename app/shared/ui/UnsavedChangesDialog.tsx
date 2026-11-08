import type { Blocker } from 'react-router'

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
} from '~/shared/ui/alert-dialog'

export function UnsavedChangesDialog({ blocker }: { blocker: Blocker }) {
  if (blocker.state !== 'blocked') return null
  return (
    <DiscardChangesDialog
      open
      onStay={() => {
        if (blocker.state === 'blocked') blocker.reset()
      }}
      onDiscard={() => {
        if (blocker.state === 'blocked') blocker.proceed()
      }}
    />
  )
}

/** Asks before unsaved changes are dropped: when leaving the page, or closing an editor that holds some. */
export function DiscardChangesDialog({
  open,
  onStay,
  onDiscard,
  description = m.common_unsaved_changes_description(),
  discardLabel = m.common_unsaved_changes_leave(),
}: {
  open: boolean
  onStay: () => void
  onDiscard: () => void
  description?: string
  discardLabel?: string
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={next => {
        if (!next) onStay()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{m.common_unsaved_changes_title()}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onStay}>{m.common_unsaved_changes_stay()}</AlertDialogCancel>
          <AlertDialogAction onClick={onDiscard}>{discardLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
