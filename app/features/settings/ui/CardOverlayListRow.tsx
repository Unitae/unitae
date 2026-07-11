import { Pencil, Spline, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { useFetcher } from 'react-router'
import { type CardOverlay, ColorPicker } from '~/features/territories'
import * as m from '~/i18n/paraglide/messages'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '~/shared/ui/alert-dialog'
import { Button } from '~/shared/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '~/shared/ui/dialog'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'

function verticesCount(count: number): string {
  return count === 1
    ? m.settings_territories_card_overlays_vertices_count_one()
    : m.settings_territories_card_overlays_vertices_count_other({ count })
}

type CardOverlayListRowProps = {
  overlay: CardOverlay
  fetcher: ReturnType<typeof useFetcher>
  canEditShape: boolean
  onStartEditing: () => void
  isEditing: boolean
}

export function CardOverlayListRow({
  overlay,
  fetcher,
  canEditShape,
  onStartEditing,
  isEditing,
}: CardOverlayListRowProps) {
  const displayName = overlay.name != null && overlay.name.length > 0 ? overlay.name : null
  const colorAriaLabel = `${m.settings_territories_card_overlays_color_label()} : ${overlay.color}`
  const idLabel = displayName ?? `#${overlay.id}`
  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-md border-l-4 bg-card py-2 pr-2 pl-3 shadow-sm data-[editing=true]:bg-primary/5 data-[editing=true]:ring-2 data-[editing=true]:ring-primary/30"
      data-editing={isEditing ? 'true' : undefined}
      style={{ borderLeftColor: overlay.color }}
    >
      <div
        className="size-6 rounded-full border"
        style={{ backgroundColor: overlay.color }}
        role="img"
        aria-label={colorAriaLabel}
      />
      <div className="min-w-0 flex-1">
        {displayName != null ? (
          <p className="truncate font-medium">{displayName}</p>
        ) : (
          <p className="truncate text-muted-foreground italic">{m.settings_territories_card_overlays_unnamed_zone()}</p>
        )}
      </div>
      <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs">
        {verticesCount(overlay.paths.length)}
      </span>
      <EditOverlayMetaDialog overlay={overlay} fetcher={fetcher} idLabel={idLabel} />
      {canEditShape ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onStartEditing}
          disabled={isEditing}
          aria-label={`${m.settings_territories_card_overlays_edit_shape()} ${idLabel}`}
        >
          <Spline aria-hidden className="size-4" />
          <span className="sr-only sm:not-sr-only">{m.settings_territories_card_overlays_edit_shape()}</span>
        </Button>
      ) : null}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            aria-label={`${m.settings_territories_card_overlays_delete()} ${idLabel}`}
          >
            <Trash2 aria-hidden className="size-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{m.settings_territories_card_overlays_delete_confirm_title()}</AlertDialogTitle>
            <AlertDialogDescription>
              {displayName != null
                ? m.settings_territories_card_overlays_delete_confirm_description_named({ name: displayName })
                : m.settings_territories_card_overlays_delete_confirm_description_unnamed()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.settings_territories_card_overlays_cancel()}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                // Submit programmatically — AlertDialog.Action auto-closes (and unmounts) the
                // dialog content, which would race against a `<fetcher.Form type="submit">` inside.
                fetcher.submit({ intent: 'delete', id: String(overlay.id) }, { method: 'post' })
              }}
            >
              {m.settings_territories_card_overlays_delete_confirm_action()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function EditOverlayMetaDialog({
  overlay,
  fetcher,
  idLabel,
}: {
  overlay: CardOverlay
  fetcher: ReturnType<typeof useFetcher>
  idLabel: string
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(overlay.name ?? '')
  const [color, setColor] = useState(overlay.color)
  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        setOpen(next)
        if (next) {
          setName(overlay.name ?? '')
          setColor(overlay.color)
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`${m.settings_territories_card_overlays_edit_meta()} ${idLabel}`}
        >
          <Pencil aria-hidden className="size-4" />
          <span className="sr-only sm:not-sr-only">{m.settings_territories_card_overlays_edit_meta()}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{m.settings_territories_card_overlays_edit_meta_dialog_title()}</DialogTitle>
        </DialogHeader>
        <fetcher.Form method="post" onSubmit={() => setOpen(false)} className="flex flex-col gap-4">
          <input type="hidden" name="intent" value="update" />
          <input type="hidden" name="id" value={overlay.id} />
          <input type="hidden" name="color" value={color} />
          <div className="space-y-2">
            <Label htmlFor={`overlay-${overlay.id}-edit-name`}>
              {m.settings_territories_card_overlays_name_label()}
            </Label>
            <Input
              id={`overlay-${overlay.id}-edit-name`}
              name="name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={m.settings_territories_card_overlays_name_placeholder()}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`overlay-${overlay.id}-edit-color`}>
              {m.settings_territories_card_overlays_color_label()}
            </Label>
            <ColorPicker id={`overlay-${overlay.id}-edit-color`} value={color} onChange={setColor} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {m.settings_territories_card_overlays_cancel()}
            </Button>
            <Button type="submit">{m.settings_territories_card_overlays_save()}</Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  )
}
