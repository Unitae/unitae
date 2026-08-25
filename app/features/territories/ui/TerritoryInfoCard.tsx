import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import * as m from '~/i18n/paraglide/messages'
import { Card, CardContent } from '~/shared/ui/card'
import { Label } from '~/shared/ui/label'
import { Textarea } from '~/shared/ui/textarea'

type TerritoryInfoCardProps = {
  territory: { number: string; type: TerritoryKindKey; notes: string | null }
  projectedContent: string
  onNotesChange: () => void
}

function typeLabel(type: TerritoryKindKey): string {
  if (type === TerritoryKindKey.Classical) return m.territories_type_classical_capitalized()
  if (type === TerritoryKindKey.Commerces) return m.territories_type_commerces()
  if (type === TerritoryKindKey.Hotel) return m.territories_type_hotel()
  if (type === TerritoryKindKey.Phone) return m.territories_type_phone_singular()
  if (type === TerritoryKindKey.Univ) return m.territories_type_university_singular()
  return ''
}

export function TerritoryInfoCard({ territory, projectedContent, onNotesChange }: TerritoryInfoCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">{m.territories_edit_number_label()}</dt>
          <dd className="font-medium">{territory.number}</dd>
          <dt className="text-muted-foreground">{m.territories_edit_type_label()}</dt>
          <dd className="font-medium">{typeLabel(territory.type)}</dd>
          <dt className="text-muted-foreground">{m.territories_edit_content_label()}</dt>
          <dd className="font-medium text-primary">{projectedContent}</dd>
        </dl>
        <p className="mt-3 text-muted-foreground text-xs italic">{m.territories_edit_info_notice()}</p>

        <div className="mt-4 flex flex-col gap-1.5 border-t pt-4">
          <Label htmlFor="territory-notes">
            {m.territories_edit_notes_label()}{' '}
            <span className="text-muted-foreground text-xs">{m.territories_edit_notes_visibility()}</span>
          </Label>
          <Textarea
            id="territory-notes"
            form="territory-edit-form"
            rows={4}
            name="notes"
            defaultValue={territory.notes ?? undefined}
            onChange={onNotesChange}
          />
        </div>
      </CardContent>
    </Card>
  )
}
