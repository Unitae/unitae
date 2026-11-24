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

/**
 * Asks before publishing what still has slots nobody holds (the user's rule: warn, still allow). The slots show
 * « À pourvoir » on the board until someone takes them.
 */
export function PublishUnfilledDialog({
  open,
  unfilled,
  onCancel,
  onConfirm,
}: {
  open: boolean
  unfilled: number
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={next => !next && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{m.programs_publish_unfilled_title()}</AlertDialogTitle>
          <AlertDialogDescription>{m.programs_publish_unfilled_body({ count: unfilled })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{m.programs_publish_unfilled_confirm()}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
