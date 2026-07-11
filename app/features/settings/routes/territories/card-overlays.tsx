import { AlertCircle, Download, Upload } from 'lucide-react'
import { useState } from 'react'
import { redirect, useFetcher } from 'react-router'
import { CardOverlayDraftForm } from '~/features/settings/ui/CardOverlayDraftForm'
import { CardOverlayImportDialog } from '~/features/settings/ui/CardOverlayImportDialog'
import { CardOverlayListRow } from '~/features/settings/ui/CardOverlayListRow'
import { PerimeterCard } from '~/features/settings/ui/PerimeterCard'
import { downloadCardOverlaysGeoJson, useCardOverlayEditor } from '~/features/settings/ui/use-card-overlay-editor'
import { CardOverlayMap, getPerimeter, listCardOverlays } from '~/features/territories'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { LimitService } from '~/shared/domain/limits.server'
import { Permission } from '~/shared/types/permission'
import { Alert, AlertDescription, AlertTitle } from '~/shared/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/shared/ui/alert-dialog'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/shared/ui/tooltip'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { getOptionalEnv } from '~/shared/utils/env.server'
import { cardOverlayActionSchema, handleCardOverlayAction } from './_card-overlays-action.server'

import type { Route } from './+types/card-overlays'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_territories_card_overlays_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Permission.TerritoriesManager)) {
    throw redirect('/')
  }
  const congregation = context.get(congregationContext)

  return withScopeFromContext(context, async db => {
    const [overlays, perimeter] = await Promise.all([listCardOverlays(db), getPerimeter(db)])
    return {
      overlays,
      perimeter,
      googleMapsApiKey: getOptionalEnv('GOOGLE_MAPS_API_KEY'),
      maxOverlays: congregation.maxCardOverlays,
    }
  })
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Permission.TerritoriesManager)) {
    throw redirect('/')
  }
  const currentUser = context.get(currentAccountContext)
  const congregation = context.get(congregationContext)
  const formData = await request.formData()
  const parsed = cardOverlayActionSchema.safeParse(Object.fromEntries(formData.entries()))
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Données invalides' }
  }

  return withScopeFromContext(context, async db => {
    const limits = new LimitService(db, congregation)
    return handleCardOverlayAction(db, limits, parsed.data, congregation.id, currentUser.id)
  })
}

export default function CardOverlaysSettingsPage({ loaderData, actionData }: Route.ComponentProps) {
  const { overlays, perimeter, googleMapsApiKey, maxOverlays } = loaderData
  const atLimit = maxOverlays != null && overlays.length >= maxOverlays
  const fetcher = useFetcher()
  const [importOpen, setImportOpen] = useState(false)

  const {
    editingId,
    perimeterMode,
    draftPaths,
    draftName,
    setDraftName,
    draftColor,
    setDraftColor,
    confirmCancelOpen,
    setConfirmCancelOpen,
    editingOverlay,
    isDraftActive,
    editingPerimeter,
    initialCenter,
    blocker,
    markDirty,
    markDraftDirty,
    startDrawing,
    startEditing,
    startEditingPerimeter,
    startNewPerimeter,
    exitDraftMode,
    handleCancelClick,
    handleDraftChange,
    isDrawing,
  } = useCardOverlayEditor(overlays, perimeter)

  const hasMapApiKey = googleMapsApiKey != null && googleMapsApiKey.length > 0

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-6">
        <PageHeader
          title={m.settings_territories_card_overlays_title()}
          subtitle={m.settings_territories_card_overlays_subtitle()}
          breadcrumbs={[
            { label: m.sidebar_settings(), to: '/settings' },
            { label: m.sidebar_settings_territories(), to: '/settings/territories' },
            { label: m.settings_territories_card_overlays_title() },
          ]}
          actions={
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                <Upload aria-hidden className="size-4" />
                {m.settings_territories_card_overlays_import_button()}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => downloadCardOverlaysGeoJson(overlays, perimeter)}
                disabled={overlays.length === 0 && perimeter == null}
              >
                <Download aria-hidden className="size-4" />
                {m.settings_territories_card_overlays_export_button()}
              </Button>
            </>
          }
        />

        {actionData != null && 'error' in actionData ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden />
            <AlertTitle>{m.settings_territories_card_overlays_error_title()}</AlertTitle>
            <AlertDescription>{actionData.error}</AlertDescription>
          </Alert>
        ) : null}

        <UnsavedChangesDialog blocker={blocker} />

        {hasMapApiKey ? (
          !isDraftActive ? (
            atLimit ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-block">
                    <Button type="button" disabled>
                      {m.settings_territories_card_overlays_new_button()}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {m.settings_territories_card_overlays_limit_reached({ max: maxOverlays ?? 0 })}
                </TooltipContent>
              </Tooltip>
            ) : (
              <Button type="button" onClick={startDrawing} className="self-start">
                {m.settings_territories_card_overlays_new_button()}
              </Button>
            )
          ) : (
            <Button type="button" variant="outline" onClick={handleCancelClick} className="self-start">
              {m.settings_territories_card_overlays_cancel()}
            </Button>
          )
        ) : null}

        {hasMapApiKey ? (
          <div className="relative" data-drawing={isDraftActive ? 'true' : undefined}>
            {isDraftActive ? (
              <span className="pointer-events-none absolute top-3 left-3 z-10 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 font-medium text-primary-foreground text-xs shadow">
                {m.settings_territories_card_overlays_drawing_chip()}
              </span>
            ) : null}
            <CardOverlayMap
              apiKey={googleMapsApiKey}
              overlays={overlays}
              excludeOverlayId={editingId}
              perimeter={perimeter?.paths ?? null}
              excludePerimeter={editingPerimeter}
              drawingEnabled={(isDrawing || perimeterMode === 'new') && draftPaths == null}
              draftPaths={draftPaths}
              draftColor={draftColor}
              onDraftChange={handleDraftChange}
              initialCenter={initialCenter}
              initialZoom={initialCenter == null ? undefined : 13}
              className="h-[480px] w-full overflow-hidden rounded-lg border transition data-[drawing=true]:ring-2 data-[drawing=true]:ring-primary/40"
            />
          </div>
        ) : (
          <Card>
            <CardContent className="p-4 text-muted-foreground text-sm">
              {m.settings_territories_card_overlays_no_api_key_notice()}
            </CardContent>
          </Card>
        )}

        {hasMapApiKey && isDraftActive ? (
          <CardOverlayDraftForm
            editingId={editingId}
            perimeterMode={perimeterMode}
            editingOverlay={editingOverlay}
            draftPaths={draftPaths}
            draftName={draftName}
            draftColor={draftColor}
            onNameChange={setDraftName}
            onColorChange={value => {
              setDraftColor(value)
              markDraftDirty()
            }}
            onFormChange={markDirty}
          />
        ) : null}

        <PerimeterCard
          perimeter={perimeter}
          hasMapApiKey={hasMapApiKey}
          perimeterMode={perimeterMode}
          fetcher={fetcher}
          onEditPerimeter={startEditingPerimeter}
          onNewPerimeter={startNewPerimeter}
        />

        <Card>
          <CardHeader>
            <CardTitle>{m.settings_territories_card_overlays_list_title()}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {overlays.length === 0 ? (
              <p className="text-muted-foreground text-sm">{m.settings_territories_card_overlays_empty()}</p>
            ) : (
              overlays.map(overlay => (
                <CardOverlayListRow
                  key={overlay.id}
                  overlay={overlay}
                  fetcher={fetcher}
                  canEditShape={hasMapApiKey}
                  onStartEditing={() => startEditing(overlay)}
                  isEditing={editingId === overlay.id}
                />
              ))
            )}
          </CardContent>
        </Card>

        <AlertDialog open={confirmCancelOpen} onOpenChange={setConfirmCancelOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{m.common_unsaved_changes_title()}</AlertDialogTitle>
              <AlertDialogDescription>{m.common_unsaved_changes_description()}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{m.common_unsaved_changes_stay()}</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  setConfirmCancelOpen(false)
                  exitDraftMode()
                }}
              >
                {m.common_unsaved_changes_leave()}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <CardOverlayImportDialog open={importOpen} onOpenChange={setImportOpen} />
      </div>
    </TooltipProvider>
  )
}
