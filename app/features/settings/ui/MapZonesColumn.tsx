import { Panel } from '@unitae/ui'
import { MoreHorizontal, Pencil, Plus, Spline, Trash2 } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import type { MapFetcher } from '~/features/settings/ui/map-fetcher'
import type { CardOverlay, CardOverlayPath } from '~/features/territories'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { ColorSwatches } from '~/shared/ui/ColorSwatches'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '~/shared/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/shared/ui/dropdown-menu'
import { useCloseOnSave } from '~/shared/ui/hooks/use-close-on-save'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/shared/ui/tooltip'
import { ConfirmDialog } from './ConfirmDialog'
import { PERIMETER_DRAFT_COLOR } from './use-card-overlay-editor'

/** A shape's corners: its points, the closing one (the first, repeated, as stored) left out. */
function points(paths: readonly { lat: number; lng: number }[]) {
  const [first, last] = [paths[0], paths[paths.length - 1]]
  const closed = paths.length > 1 && first.lat === last.lat && first.lng === last.lng
  const count = closed ? paths.length - 1 : paths.length
  return m.settings_map_points({ count: count })
}

const zoneName = (overlay: CardOverlay) =>
  overlay.name != null && overlay.name.length > 0 ? overlay.name : m.settings_territories_card_overlays_unnamed_zone()

interface ZonesPanelProps {
  overlays: CardOverlay[]
  fetcher: MapFetcher
  canDraw: boolean
  /** The zone limit of the plan, when it is reached. */
  limitReached: number | null
  onDraw: () => void
  onEditShape: (overlay: CardOverlay) => void
  /** The congregation's perimeter, the list's first row (`PerimeterRow`). */
  perimeter?: ReactNode
}

/**
 * The perimeter, then the zones printed on the territory cards: each with its colour and its points, and what can be
 * done with it.
 */
export function ZonesPanel({
  overlays,
  fetcher,
  canDraw,
  limitReached,
  onDraw,
  onEditShape,
  perimeter,
}: ZonesPanelProps) {
  const [renaming, setRenaming] = useState<CardOverlay | null>(null)
  const [deleting, setDeleting] = useState<CardOverlay | null>(null)

  const draw = (
    <Button type="button" size="sm" variant="outline" onClick={onDraw} disabled={limitReached != null}>
      <Plus aria-hidden="true" />
      {m.settings_map_draw()}
    </Button>
  )

  return (
    <Panel
      title={m.settings_map_zones_title()}
      actions={
        canDraw &&
        (limitReached != null ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>{draw}</span>
            </TooltipTrigger>
            <TooltipContent>{m.settings_territories_card_overlays_limit_reached({ max: limitReached })}</TooltipContent>
          </Tooltip>
        ) : (
          draw
        ))
      }
    >
      {perimeter}
      {overlays.length === 0 ? (
        <p className="border-t px-4.5 py-4 text-muted-foreground text-sm first:border-t-0">
          {m.settings_map_zones_empty()}
        </p>
      ) : (
        overlays.map(overlay => (
          <div key={overlay.id} className="flex items-center gap-3 border-t px-4.5 py-2.5 first:border-t-0">
            <span
              aria-hidden="true"
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: overlay.color }}
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium text-sm">{zoneName(overlay)}</span>
              <span className="text-faint text-xs">{points(overlay.paths)}</span>
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={m.settings_map_zone_actions({ name: zoneName(overlay) })}
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setRenaming(overlay)}>
                  <Pencil />
                  {m.settings_map_rename()}
                </DropdownMenuItem>
                {canDraw && (
                  <DropdownMenuItem onSelect={() => onEditShape(overlay)}>
                    <Spline />
                    {m.settings_territories_card_overlays_edit_shape()}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(overlay)}>
                  <Trash2 />
                  {m.settings_territories_card_overlays_delete()}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))
      )}

      <ZoneMetaDialog key={renaming?.id} overlay={renaming} fetcher={fetcher} onClose={() => setRenaming(null)} />
      <ConfirmDialog
        open={deleting != null}
        onOpenChange={open => !open && setDeleting(null)}
        title={m.settings_territories_card_overlays_delete_confirm_title()}
        description={
          deleting?.name
            ? m.settings_territories_card_overlays_delete_confirm_description_named({ name: deleting.name })
            : m.settings_territories_card_overlays_delete_confirm_description_unnamed()
        }
        confirmLabel={m.settings_territories_card_overlays_delete_confirm_action()}
        destructive
        onConfirm={() => deleting && fetcher.submit({ intent: 'delete', id: String(deleting.id) }, { method: 'post' })}
      />
    </Panel>
  )
}

function ZoneMetaDialog({
  overlay,
  fetcher,
  onClose,
}: {
  overlay: CardOverlay | null
  fetcher: MapFetcher
  onClose: () => void
}) {
  const [color, setColor] = useState(overlay?.color ?? '')
  useCloseOnSave(fetcher, onClose)

  return (
    <Dialog open={overlay != null} onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{m.settings_territories_card_overlays_edit_meta_dialog_title()}</DialogTitle>
        </DialogHeader>
        {overlay && (
          <fetcher.Form method="post" className="flex flex-col gap-4">
            <input type="hidden" name="intent" value="update" />
            <input type="hidden" name="id" value={overlay.id} />
            <input type="hidden" name="color" value={color} />
            <div className="flex flex-col gap-2">
              <Label htmlFor="zone-name">{m.settings_territories_card_overlays_name_label()}</Label>
              <Input
                id="zone-name"
                name="name"
                defaultValue={overlay.name ?? ''}
                placeholder={m.settings_territories_card_overlays_name_placeholder()}
              />
            </div>
            <div className="flex flex-col gap-2">
              <span className="font-medium text-sm">{m.settings_territories_card_overlays_color_label()}</span>
              <ColorSwatches
                label={m.settings_territories_card_overlays_color_label()}
                value={color}
                onChange={setColor}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                {m.common_cancel()}
              </Button>
              <Button type="submit" disabled={fetcher.state !== 'idle'}>
                {m.common_save()}
              </Button>
            </DialogFooter>
          </fetcher.Form>
        )}
      </DialogContent>
    </Dialog>
  )
}

interface PerimeterRowProps {
  perimeter: { paths: CardOverlayPath[] } | null
  fetcher: MapFetcher
  canDraw: boolean
  onEdit: () => void
  onDefine: () => void
}

/**
 * The boundary of the congregation's territory, as the zone list's first row: addresses imported outside it are set
 * apart. A dashed swatch, its points or the sentence saying there is none, and « Modifier » or « Définir ».
 */
export function PerimeterRow({ perimeter, fetcher, canDraw, onEdit, onDefine }: PerimeterRowProps) {
  const [clearing, setClearing] = useState(false)

  return (
    <div className="flex items-center gap-3 border-t px-4.5 py-2.5 first:border-t-0">
      <span
        aria-hidden="true"
        className="size-3 shrink-0 rounded-full border-2 border-dashed"
        style={{ borderColor: PERIMETER_DRAFT_COLOR }}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium text-sm">{m.settings_territories_card_overlays_perimeter_section_title()}</span>
        <span className="text-faint text-xs">
          {perimeter ? points(perimeter.paths) : m.settings_map_perimeter_none()}
        </span>
      </span>
      {perimeter ? (
        <>
          {canDraw && (
            <Button type="button" size="sm" variant="ghost" onClick={onEdit}>
              <Spline aria-hidden="true" />
              {m.settings_map_perimeter_edit()}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={m.settings_map_perimeter_actions()}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem variant="destructive" onSelect={() => setClearing(true)}>
                <Trash2 />
                {m.settings_territories_card_overlays_perimeter_delete_button()}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      ) : (
        canDraw && (
          <Button type="button" size="sm" variant="ghost" onClick={onDefine}>
            <Plus aria-hidden="true" />
            {m.settings_map_perimeter_define()}
          </Button>
        )
      )}
      <ConfirmDialog
        open={clearing}
        onOpenChange={setClearing}
        title={m.settings_territories_card_overlays_perimeter_delete_confirm_title()}
        description={m.settings_territories_card_overlays_perimeter_delete_confirm_description()}
        confirmLabel={m.settings_territories_card_overlays_perimeter_delete_button()}
        destructive
        onConfirm={() => fetcher.submit({ intent: 'clear-perimeter' }, { method: 'post' })}
      />
    </div>
  )
}

interface ZoneDraftPanelProps {
  draft: MapFetcher
  /** What is being drawn: a zone (new or `editing`), or the perimeter. */
  perimeterMode: 'new' | 'edit' | null
  editing: CardOverlay | null
  paths: CardOverlayPath[] | null
  name: string
  color: string
  onNameChange: (name: string) => void
  onColorChange: (color: string) => void
  onCancel: () => void
}

/** The zone or the perimeter being drawn: what to do on the map, then its name and colour, and the save. */
export function ZoneDraftPanel({
  draft,
  perimeterMode,
  editing,
  paths,
  name,
  color,
  onNameChange,
  onColorChange,
  onCancel,
}: ZoneDraftPanelProps) {
  const isPerimeter = perimeterMode != null
  const title = isPerimeter
    ? m.settings_territories_card_overlays_perimeter_section_title()
    : editing
      ? m.settings_map_edit_zone()
      : m.settings_map_new_zone()
  // Once the shape is closed, the points are what is left to adjust.
  const reshaping = paths != null
  const intent = isPerimeter ? 'set-perimeter' : editing ? 'update' : 'create'

  return (
    <Panel title={title} padded>
      <draft.Form method="post" className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">
          {reshaping ? m.settings_map_editing_shape() : m.settings_territories_card_overlays_drawing_hint()}
        </p>
        <input type="hidden" name="intent" value={intent} />
        {editing && !isPerimeter && <input type="hidden" name="id" value={editing.id} />}
        {paths && <input type="hidden" name="paths" value={JSON.stringify(paths)} />}
        {!isPerimeter && (
          <>
            <input type="hidden" name="color" value={color} />
            <div className="flex flex-col gap-2">
              <Label htmlFor="draft-zone-name">{m.settings_territories_card_overlays_name_label()}</Label>
              <Input
                id="draft-zone-name"
                name="name"
                value={name}
                onChange={event => onNameChange(event.target.value)}
                placeholder={m.settings_territories_card_overlays_name_placeholder()}
              />
            </div>
            <div className="flex flex-col gap-2">
              <span className="font-medium text-sm">{m.settings_territories_card_overlays_color_label()}</span>
              <ColorSwatches
                label={m.settings_territories_card_overlays_color_label()}
                value={color}
                onChange={onColorChange}
              />
            </div>
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            {m.common_cancel()}
          </Button>
          <Button type="submit" disabled={paths == null || draft.state !== 'idle'}>
            {m.common_save()}
          </Button>
        </div>
      </draft.Form>
    </Panel>
  )
}
