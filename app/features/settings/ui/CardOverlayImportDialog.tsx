import { useState } from 'react'
import type { MapFetcher } from '~/features/settings/ui/map-fetcher'
import { parseGeoJsonImport } from '~/features/territories'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/shared/ui/dialog'
import { useCloseOnSave } from '~/shared/ui/hooks/use-close-on-save'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { Textarea } from '~/shared/ui/textarea'

export const GEOJSON_FILE_ACCEPT = '.geojson,application/geo+json,application/json'

export async function readGeoJsonFileText(files: FileList | null): Promise<string | null> {
  const file = files?.[0]
  if (file == null) return null
  return file.text()
}

/** Whether the pasted or chosen file carries a perimeter, which would replace the congregation's. */
function carriesPerimeter(text: string): boolean {
  try {
    return parseGeoJsonImport(JSON.parse(text)).perimeter != null
  } catch {
    return false
  }
}

type CardOverlayImportDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  fetcher: MapFetcher
  /** The congregation already has a perimeter: a file carrying one replaces it, which the dialog says first. */
  hasPerimeter: boolean
}

/** Imports zones (and maybe a perimeter) from a GeoJSON file, chosen or pasted. */
export function CardOverlayImportDialog({ open, onOpenChange, fetcher, hasPerimeter }: CardOverlayImportDialogProps) {
  const [importText, setImportText] = useState('')
  const replaces = hasPerimeter && carriesPerimeter(importText)
  useCloseOnSave(fetcher, () => {
    onOpenChange(false)
    setImportText('')
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{m.settings_territories_card_overlays_import_dialog_title()}</DialogTitle>
          <DialogDescription>{m.settings_territories_card_overlays_import_dialog_description()}</DialogDescription>
        </DialogHeader>
        <fetcher.Form method="post" className="flex min-h-0 flex-1 flex-col gap-4">
          <input type="hidden" name="intent" value="import-geojson" />
          <div className="flex flex-col gap-2">
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
            onChange={event => setImportText(event.target.value)}
            required
            className="min-h-[200px] flex-1 resize-none font-mono text-xs"
          />
          {replaces && (
            <p role="status" className="rounded-md bg-warning-soft px-3 py-2.5 text-sm">
              {m.settings_map_import_replaces()}
            </p>
          )}
          <DialogFooter className="mt-2 shrink-0">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {m.common_cancel()}
            </Button>
            <Button type="submit" variant={replaces ? 'destructive' : 'default'} disabled={fetcher.state !== 'idle'}>
              {replaces ? m.settings_map_import_replace_submit() : m.settings_map_import_submit()}
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  )
}
