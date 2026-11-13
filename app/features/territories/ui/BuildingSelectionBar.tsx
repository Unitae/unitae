import { SelectionBar } from '@unitae/ui'
import { useState } from 'react'
import { Form } from 'react-router'

import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/shared/ui/alert-dialog'
import { Button } from '~/shared/ui/button'
import { SubmitButton } from '~/shared/ui/SubmitButton'

// Past this many, the dialog counts the buildings instead of naming them.
const NAMED_UP_TO = 4

interface BuildingSelectionBarProps {
  selected: { id: number; number: string; street: string }[]
  onClear: () => void
}

/** « 2 sélectionnés · Désactiver les 2 », then a confirmation naming what changes. */
export function BuildingSelectionBar({ selected, onClear }: BuildingSelectionBarProps) {
  const [confirming, setConfirming] = useState(false)
  const count = selected.length
  const addresses = selected.map(b => `${b.number} ${b.street}`)
  const body =
    count === 1
      ? m.prospection_deactivate_body_one({ address: addresses[0] })
      : count <= NAMED_UP_TO
        ? m.prospection_deactivate_body({
            addresses: new Intl.ListFormat(getLocale(), { type: 'conjunction' }).format(addresses),
          })
        : m.prospection_deactivate_body_count({ count })
  const action = count === 1 ? m.prospection_deactivate_one() : m.prospection_deactivate_many({ count })

  return (
    <>
      <SelectionBar
        label={m.prospection_selected({ count })}
        onClear={onClear}
        clearLabel={m.prospection_selection_clear()}
        aria-label={m.prospection_selection_actions()}
      >
        <Button size="sm" onClick={() => setConfirming(true)}>
          {action}
        </Button>
      </SelectionBar>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{m.prospection_deactivate_title({ count })}</AlertDialogTitle>
            <AlertDialogDescription>{body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
            <Form method="post" action="/territories/buildings/deactivate" onSubmit={() => setConfirming(false)}>
              {selected.map(b => (
                <input key={b.id} type="hidden" name="buildingId" value={b.id} />
              ))}
              <SubmitButton>{action}</SubmitButton>
            </Form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
