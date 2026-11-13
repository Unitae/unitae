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

export interface DeletableBuilding {
  id: number
  number: string
  street: string
  zip: string
}

/**
 * « Supprimer le bâtiment ? », from a row's « … », the building's page or its address page. Says which building, then
 * posts to its delete action, which goes back where the reader came from.
 */
export function DeleteBuildingDialog({
  building,
  onClose,
}: {
  building: DeletableBuilding | null
  onClose: () => void
}) {
  return (
    <AlertDialog open={building != null} onOpenChange={open => !open && onClose()}>
      <AlertDialogContent>
        {building && (
          <Form method="post" action={`/territories/building/${building.id}/delete`} className="flex flex-col gap-4">
            <AlertDialogHeader>
              <AlertDialogTitle>{m.prospection_delete_building_title()}</AlertDialogTitle>
              <AlertDialogDescription>
                {m.prospection_delete_building_description({
                  address: `${building.number} ${building.street}, ${building.zip}`,
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">{m.common_cancel()}</AlertDialogCancel>
              <SubmitButton variant="destructive">{m.prospection_delete_building_submit()}</SubmitButton>
            </AlertDialogFooter>
          </Form>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
