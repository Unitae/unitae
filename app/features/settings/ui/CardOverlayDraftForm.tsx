import { Form } from 'react-router'
import { type CardOverlay, type CardOverlayPath, ColorPicker } from '~/features/territories'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'

type CardOverlayDraftFormProps = {
  editingId: number | null
  perimeterMode: 'new' | 'edit' | null
  editingOverlay: CardOverlay | null
  draftPaths: CardOverlayPath[] | null
  draftName: string
  draftColor: string
  onNameChange: (value: string) => void
  onColorChange: (value: string) => void
  onFormChange: () => void
}

export function CardOverlayDraftForm({
  editingId,
  perimeterMode,
  editingOverlay,
  draftPaths,
  draftName,
  draftColor,
  onNameChange,
  onColorChange,
  onFormChange,
}: CardOverlayDraftFormProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{draftFormTitle(perimeterMode, editingId, editingOverlay)}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {editingId == null && perimeterMode !== 'edit' ? (
          <p className="text-muted-foreground text-sm">{m.settings_territories_card_overlays_drawing_hint()}</p>
        ) : null}
        {draftPaths == null ? (
          <p className="text-muted-foreground text-sm italic">
            {m.settings_territories_card_overlays_no_polygon_drawn()}
          </p>
        ) : (
          <Form method="post" className="flex flex-wrap items-end gap-4" onChange={onFormChange}>
            <input
              type="hidden"
              name="intent"
              value={perimeterMode != null ? 'set-perimeter' : editingId == null ? 'create' : 'update'}
            />
            {editingId != null && perimeterMode == null ? <input type="hidden" name="id" value={editingId} /> : null}
            <input type="hidden" name="paths" value={JSON.stringify(draftPaths)} />
            {perimeterMode == null ? (
              <>
                <input type="hidden" name="color" value={draftColor} />
                <div className="min-w-[200px] flex-1 space-y-2">
                  <Label htmlFor="card-overlay-name">{m.settings_territories_card_overlays_name_label()}</Label>
                  <Input
                    id="card-overlay-name"
                    name="name"
                    value={draftName}
                    onChange={e => {
                      onNameChange(e.target.value)
                      onFormChange()
                    }}
                    placeholder={m.settings_territories_card_overlays_name_placeholder()}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="card-overlay-color">{m.settings_territories_card_overlays_color_label()}</Label>
                  <ColorPicker id="card-overlay-color" value={draftColor} onChange={onColorChange} />
                </div>
              </>
            ) : null}
            <Button type="submit">{m.settings_territories_card_overlays_save()}</Button>
          </Form>
        )}
      </CardContent>
    </Card>
  )
}

function draftFormTitle(
  perimeterMode: 'new' | 'edit' | null,
  editingId: number | null,
  editingOverlay: CardOverlay | null,
): string {
  if (perimeterMode === 'edit') return m.settings_territories_card_overlays_perimeter_editing_banner()
  if (perimeterMode === 'new') return m.settings_territories_card_overlays_perimeter_drawing_title()
  if (editingId != null) {
    return editingOverlay?.name != null && editingOverlay.name.length > 0
      ? m.settings_territories_card_overlays_editing_banner_named({ name: editingOverlay.name })
      : m.settings_territories_card_overlays_editing_banner_unnamed()
  }
  return m.settings_territories_card_overlays_new_button()
}
