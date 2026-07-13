import { useState } from 'react'
import { Form } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/shared/ui/dialog'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { Textarea } from '~/shared/ui/textarea'

export const GEOJSON_FILE_ACCEPT = '.geojson,application/geo+json,application/json'

export async function readGeoJsonFileText(files: FileList | null): Promise<string | null> {
  const file = files?.[0]
  if (file == null) return null
  return file.text()
}

type CardOverlayImportDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CardOverlayImportDialog({ open, onOpenChange }: CardOverlayImportDialogProps) {
  const [importText, setImportText] = useState('')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{m.settings_territories_card_overlays_import_dialog_title()}</DialogTitle>
          <DialogDescription>{m.settings_territories_card_overlays_import_dialog_description()}</DialogDescription>
        </DialogHeader>
        <Form
          method="post"
          onSubmit={() => {
            onOpenChange(false)
            setImportText('')
          }}
          className="flex min-h-0 flex-1 flex-col gap-4"
        >
          <input type="hidden" name="intent" value="import-geojson" />
          <div className="space-y-2">
            <Label htmlFor="card-overlay-geojson-file">
              {m.settings_territories_card_overlays_import_file_label()}
            </Label>
            <Input
              id="card-overlay-geojson-file"
              type="file"
              accept={GEOJSON_FILE_ACCEPT}
              onChange={async event => {
                const text = await readGeoJsonFileText(event.target.files)
                if (text != null) setImportText(text)
              }}
            />
            <p className="text-muted-foreground text-xs">{m.settings_territories_card_overlays_import_or_paste()}</p>
          </div>
          <Label htmlFor="card-overlay-geojson" className="sr-only">
            {m.settings_territories_card_overlays_import_paste_label()}
          </Label>
          <Textarea
            id="card-overlay-geojson"
            name="geojson"
            value={importText}
            onChange={e => setImportText(e.target.value)}
            required
            className="min-h-[200px] flex-1 resize-none font-mono text-xs"
          />
          <DialogFooter className="mt-2 flex-shrink-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {m.settings_territories_card_overlays_cancel()}
            </Button>
            <Button type="submit">{m.settings_territories_card_overlays_save()}</Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
