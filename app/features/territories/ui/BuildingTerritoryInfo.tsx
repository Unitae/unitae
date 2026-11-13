import { Panel } from '@unitae/ui'
import { Form } from 'react-router'
import type { Building } from '~/database/generated/client'
import * as m from '~/i18n/paraglide/messages'
import { Label } from '~/shared/ui/label'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Textarea } from '~/shared/ui/textarea'

/** The building's notes for the territory: kept on the territory's sheet, not shown to the publisher. */
export default function BuildingTerritoryInfo({ building }: { building: Building }) {
  return (
    <Panel title={m.prospection_territory_notes_title()} padded className="lg:col-span-2">
      <Form method="post" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="building-notes">
            {m.prospection_territory_notes_label()}{' '}
            <span className="font-normal text-faint text-sm">{m.prospection_territory_notes_visibility()}</span>
          </Label>
          <Textarea id="building-notes" rows={4} name="notes" defaultValue={building.notes ?? ''} />
        </div>
        <p className="m-0 text-faint text-xs">{m.prospection_territory_notes_hint()}</p>
        <SubmitButton className="self-start">{m.prospection_territory_notes_submit()}</SubmitButton>
      </Form>
    </Panel>
  )
}
