import { Form } from 'react-router'
import type { Building } from '~/database/generated/client'
import * as m from '~/paraglide/messages'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Label } from '~/shared/ui/label'
import { SubmitButton } from '~/shared/ui/SubmitButton'

export default function BuildingTerritoryInfo({ building }: { building: Building }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.prospection_territory_notes_title()}</CardTitle>
      </CardHeader>
      <CardContent>
        <Form method="post" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>
              {m.prospection_territory_notes_label()}{' '}
              <span className="text-muted-foreground text-sm">{m.prospection_territory_notes_visibility()}</span>
            </Label>
            <textarea className="rounded-md border border-input bg-background px-3 py-2 text-sm" rows={4} name="notes">
              {building.notes}
            </textarea>
          </div>
          <p className="text-muted-foreground text-sm italic">{m.prospection_territory_notes_hint()}</p>
          <SubmitButton className="self-start">{m.prospection_territory_notes_submit()}</SubmitButton>
        </Form>
      </CardContent>
    </Card>
  )
}
