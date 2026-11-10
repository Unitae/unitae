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
import { formatGroupName } from '~/shared/utils/format-group-name'

export interface DeletableGroup {
  id: number
  name: string
  publisherCount: number
}

function consequence(count: number) {
  if (count === 0) return m.groups_delete_dialog_empty()
  return count === 1
    ? m.groups_delete_dialog_members_one()
    : m.groups_delete_dialog_members_other({ count: String(count) })
}

/**
 * « Supprimer le groupe Sud ? », from the « … » of the edit page or of a row of the groups list. Says what becomes of
 * its publishers, then posts to the group's delete action, which goes back to the groups list.
 */
export function DeleteGroupDialog({ group, onClose }: { group: DeletableGroup | null; onClose: () => void }) {
  return (
    <AlertDialog open={group != null} onOpenChange={open => !open && onClose()}>
      <AlertDialogContent>
        {group && (
          <Form method="post" action={`/groups/${group.id}/delete`} className="flex flex-col gap-4">
            <AlertDialogHeader>
              <AlertDialogTitle>{m.groups_delete_dialog_title({ name: formatGroupName(group.name) })}</AlertDialogTitle>
              <AlertDialogDescription>{consequence(group.publisherCount)}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">{m.common_cancel()}</AlertDialogCancel>
              <SubmitButton variant="destructive">{m.groups_delete_dialog_confirm()}</SubmitButton>
            </AlertDialogFooter>
          </Form>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
