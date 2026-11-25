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

type InlineDeleteDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemName: string
  onConfirm: () => void
  isDeleting: boolean
  /** Where focus goes once it closes, when what opened it is gone (a menu item, a page button); the default otherwise. */
  returnFocus?: () => HTMLElement | null
}

export function InlineDeleteDialog({
  open,
  onOpenChange,
  itemName,
  onConfirm,
  isDeleting,
  returnFocus,
}: InlineDeleteDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        size="sm"
        onCloseAutoFocus={event => {
          const target = returnFocus?.()
          if (target == null) return
          event.preventDefault()
          target.focus()
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{m.programs_edit_delete_confirm_title()}</AlertDialogTitle>
          <AlertDialogDescription>
            {itemName} — {m.programs_edit_delete_confirm_description()}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>{m.common_cancel()}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm} disabled={isDeleting}>
            {m.common_delete()}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
