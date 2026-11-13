import { Callout } from '@unitae/ui'
import { Download, MoreHorizontal, Upload } from 'lucide-react'
import { useState } from 'react'
import { data, redirect, useFetcher } from 'react-router'
import { CardOverlayImportDialog } from '~/features/settings/ui/CardOverlayImportDialog'
import { ConfirmDialog } from '~/features/settings/ui/ConfirmDialog'
import { PerimeterRow, ZoneDraftPanel, ZonesPanel } from '~/features/settings/ui/MapZonesColumn'
import { SettingsHeader } from '~/features/settings/ui/SettingsHeader'
import { downloadCardOverlaysGeoJson, useCardOverlayEditor } from '~/features/settings/ui/use-card-overlay-editor'
import { CardOverlayMap, reachAround } from '~/features/territories'
import { getBaseMap, getPerimeter, listCardOverlays } from '~/features/territories/index.server'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { LimitService } from '~/shared/domain/limits.server'
import { LimitReachedError } from '~/shared/errors/app-error.server'
import { getMapTiles } from '~/shared/infra/map-tiles.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/shared/ui/dropdown-menu'
import { TooltipProvider } from '~/shared/ui/tooltip'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { cn } from '~/shared/utils/utils'
import { cardOverlayActionSchema, handleCardOverlayAction } from './_map-action.server'
import { okWithToast } from './_toast.server'
import type { Route } from './+types/map'

export const meta: Route.MetaFunction = () => [{ title: m.settings_map_meta_title() }]

export function loader({ context }: Route.LoaderArgs) {
  if (!context.get(permissionsContext).has(Permission.CanConfigureTerritorySettings)) throw redirect('/')
  const congregation = context.get(congregationContext)

  return withScopeFromContext(context, async (db, congregationId) => {
    const [overlays, perimeter, baseMap] = await Promise.all([
      listCardOverlays(db),
      getPerimeter(db),
      getBaseMap(db, congregationId),
    ])
    return {
      overlays,
      perimeter,
      // The perimeter is drawn here and partly makes the area: the map reaches some ten kilometres beyond it.
      map: baseMap == null ? null : { tiles: baseMap.tiles, area: reachAround(baseMap.area), home: baseMap.area },
      // Without a map: no base map on the instance, or nothing drawn or placed yet to open it on.
      noMap: baseMap != null ? null : getMapTiles() == null ? ('tiles' as const) : ('area' as const),
      maxOverlays: congregation.maxCardOverlays,
    }
  })
}

export async function action({ request, context }: Route.ActionArgs) {
  if (!context.get(permissionsContext).has(Permission.CanConfigureTerritorySettings)) throw redirect('/')
  const currentUser = context.get(currentAccountContext)
  const congregation = context.get(congregationContext)
  const parsed = cardOverlayActionSchema.safeParse(Object.fromEntries((await request.formData()).entries()))
  if (!parsed.success) return data({ ok: false as const, error: m.settings_map_save_failed() }, { status: 400 })

  try {
    const result = await withScopeFromContext(context, db =>
      handleCardOverlayAction(db, new LimitService(db, congregation), parsed.data, congregation.id, currentUser.id),
    )
    if (!result.ok) return data(result, { status: 400 })
    return okWithToast(request, result.message)
  } catch (error) {
    if (!(error instanceof LimitReachedError)) throw error
    const max = congregation.maxCardOverlays
    const message = max != null ? m.settings_map_limit({ max: String(max) }) : m.settings_map_limit_generic()
    return data({ ok: false as const, error: message }, { status: 400 })
  }
}

export default function CongregationMapPage({ loaderData }: Route.ComponentProps) {
  const { overlays, perimeter, map, noMap, maxOverlays } = loaderData
  const fetcher = useFetcher<typeof action>()
  const draft = useFetcher<typeof action>()
  const [importOpen, setImportOpen] = useState(false)
  const editor = useCardOverlayEditor(overlays, perimeter, draft)
  const canDraw = map != null
  const limitReached = maxOverlays != null && overlays.length >= maxOverlays ? maxOverlays : null
  const errorOf = (result: typeof fetcher.data) => (result != null && !result.ok ? result.error : null)
  const error = errorOf(draft.data) ?? errorOf(fetcher.data)

  return (
    <TooltipProvider>
      <div className="flex flex-col">
        <SettingsHeader
          title={m.settings_entry_map()}
          subtitle={m.settings_map_subtitle()}
          actions={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={m.common_more_actions()}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setImportOpen(true)}>
                  <Upload />
                  {m.settings_map_import()}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={overlays.length === 0 && perimeter == null}
                  onSelect={() => downloadCardOverlaysGeoJson(overlays, perimeter)}
                >
                  <Download />
                  {m.settings_map_export()}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />
        <UnsavedChangesDialog blocker={editor.blocker} />

        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          {map != null ? (
            <div className={cn('rounded-lg', editor.isDraftActive && 'ring-2 ring-brand/40')}>
              <CardOverlayMap
                map={map}
                home={map.home}
                overlays={overlays}
                excludeOverlayId={editor.editingId}
                perimeter={perimeter?.paths ?? null}
                excludePerimeter={editor.editingPerimeter}
                drawingEnabled={(editor.isDrawing || editor.perimeterMode === 'new') && editor.draftPaths == null}
                draftPaths={editor.draftPaths}
                draftColor={editor.draftColor}
                onDraftChange={editor.handleDraftChange}
                className="h-[560px] w-full overflow-hidden rounded-lg border max-lg:h-[420px]"
              />
            </div>
          ) : (
            <p className="rounded-lg border bg-card px-4.5 py-4 text-muted-foreground text-sm">
              {noMap === 'area' ? m.settings_map_no_area() : m.settings_map_no_base_map()}
            </p>
          )}

          <div className="flex flex-col gap-4">
            {error && <Callout tone="danger" role="alert" title={error} />}
            {editor.isDraftActive ? (
              <ZoneDraftPanel
                draft={draft}
                perimeterMode={editor.perimeterMode}
                editing={editor.editingOverlay}
                paths={editor.draftPaths}
                name={editor.draftName}
                color={editor.draftColor}
                onNameChange={name => {
                  editor.setDraftName(name)
                  editor.markDraftDirty()
                }}
                onColorChange={color => {
                  editor.setDraftColor(color)
                  editor.markDraftDirty()
                }}
                onCancel={editor.handleCancelClick}
              />
            ) : (
              <>
                <ZonesPanel
                  overlays={overlays}
                  fetcher={fetcher}
                  canDraw={canDraw}
                  limitReached={limitReached}
                  onDraw={editor.startDrawing}
                  onEditShape={editor.startEditing}
                  perimeter={
                    <PerimeterRow
                      perimeter={perimeter}
                      fetcher={fetcher}
                      canDraw={canDraw}
                      onEdit={editor.startEditingPerimeter}
                      onDefine={editor.startNewPerimeter}
                    />
                  }
                />
              </>
            )}
          </div>
        </div>

        <ConfirmDialog
          open={editor.confirmCancelOpen}
          onOpenChange={editor.setConfirmCancelOpen}
          title={m.common_unsaved_changes_title()}
          description={m.common_unsaved_changes_description()}
          confirmLabel={m.common_unsaved_changes_leave()}
          destructive
          onConfirm={() => {
            editor.setConfirmCancelOpen(false)
            editor.exitDraftMode()
          }}
        />
        <CardOverlayImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          fetcher={fetcher}
          hasPerimeter={perimeter != null}
        />
      </div>
    </TooltipProvider>
  )
}

export { RouteErrorBoundary as ErrorBoundary } from '~/shared/ui/RouteErrorBoundary'
