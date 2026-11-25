import { type PartRoom, roomLabel } from '~/features/events/model/part-places'
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

/**
 * « Retirer « Lecture de la Bible » de « Salle C » ? » (design « TourA-Salles-Partie »): a part's save takes it out of
 * rooms; meetings already prepared keep it there.
 */
export function RoomRemovalDialog({
  part,
  rooms,
  onCancel,
  onConfirm,
}: {
  part: string
  /** The rooms the save takes it out of; none closes the dialog. */
  rooms: readonly PartRoom[]
  onCancel: () => void
  onConfirm: () => void
}) {
  const names = new Intl.ListFormat(getLocale(), { type: 'conjunction' }).format(
    rooms.map(room => m.programs_edit_part_where_room_quoted({ name: roomLabel(room) })),
  )
  return (
    <AlertDialog open={rooms.length > 0} onOpenChange={open => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{m.programs_edit_part_where_remove_title({ part, rooms: names })}</AlertDialogTitle>
          <AlertDialogDescription>{m.programs_edit_part_where_remove_body()}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{m.programs_edit_part_where_remove_confirm()}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
