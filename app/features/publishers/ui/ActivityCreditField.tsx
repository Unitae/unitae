import * as m from '~/i18n/paraglide/messages'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'

/**
 * The secretary's hour-credit field on a monthly report. Rendered only for
 * CanCorrectActivity holders — group responsibles record what the publisher did in the
 * observations, and the secretary turns that into a credit here. The credit counts toward
 * the pioneer's goal on the pioneers board, never into exports. An emptied field clears it.
 */
export function ActivityCreditField({ name, defaultValue }: { name: string; defaultValue: number | null }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="creditHours">{m.activity_edit_credit_label()}</Label>
      <Input id="creditHours" name={name} type="number" min={0} defaultValue={defaultValue ?? ''} />
      <p className="text-muted-foreground text-xs">{m.activity_edit_credit_hint()}</p>
    </div>
  )
}
