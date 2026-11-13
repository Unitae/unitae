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

export interface DeletableBoardItem {
  kind: 'pdf' | 'dynamic'
  id: number
  title: string
}

/**
 * « Supprimer … ? » for a PDF or a dynamic document, from its row's « … » or its edit page. Says what goes with it,
 * then posts to its delete action, which goes back to the board's list.
 */
export function DeleteBoardItemDialog({ item, onClose }: { item: DeletableBoardItem | null; onClose: () => void }) {
  const pdf = item?.kind === 'pdf'
  return (
    <AlertDialog open={item != null} onOpenChange={open => !open && onClose()}>
      <AlertDialogContent>
        {item && (
          <Form
            method="post"
            action={pdf ? `/board/documents/${item.id}/delete` : `/board/dynamic/${item.id}/delete`}
            className="flex flex-col gap-4"
          >
            <AlertDialogHeader>
              <AlertDialogTitle>
                {pdf
                  ? m.board_documents_delete_confirmation({ name: item.title })
                  : m.board_dynamic_delete_confirmation({ name: item.title })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {pdf ? m.board_documents_delete_what() : m.board_dynamic_delete_what()}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">{m.common_cancel()}</AlertDialogCancel>
              <SubmitButton variant="destructive">
                {pdf ? m.board_documents_delete_button() : m.board_dynamic_delete_button()}
              </SubmitButton>
            </AlertDialogFooter>
          </Form>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
