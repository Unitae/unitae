import { AlertCircle, Download, Pencil, Spline, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Form, redirect, useFetcher, useNavigation } from 'react-router'
import { z } from 'zod'
import {
  buildGeoJsonExport,
  type CardOverlay,
  type CardOverlayPath,
  cardOverlayColorSchema,
  cardOverlayNameSchema,
  cardOverlayPathsSchema,
  GeoJsonValidationError,
  parseGeoJsonImport,
} from '~/features/territories/model/card-overlay'
import {
  createCardOverlay,
  deleteCardOverlay,
  listCardOverlays,
  updateCardOverlay,
} from '~/features/territories/server/card-overlays.server'
import { clearPerimeter, getPerimeter, setPerimeter } from '~/features/territories/server/perimeter.server'
import CardOverlayMap from '~/features/territories/ui/CardOverlayMap'
import { ColorPicker } from '~/features/territories/ui/ColorPicker'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  permissionsContext,
  currentAccountContext,
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
  AlertDialogTrigger,
} from '~/shared/ui/alert-dialog'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/shared/ui/dialog'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Textarea } from '~/shared/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/shared/ui/tooltip'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { getOptionalEnv } from '~/shared/utils/env.server'

import type { Route } from './+types/card-overlays'

const DEFAULT_OVERLAY_COLOR = '#C2175B'
const PERIMETER_DRAFT_COLOR = '#6B7280'

function verticesCount(count: number): string {
  return count === 1
    ? m.settings_territories_card_overlays_vertices_count_one()
    : m.settings_territories_card_overlays_vertices_count_other({ count })
}

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

const createSchema = z.object({
  intent: z.literal('create'),
  name: z
    .string()
    .nullable()
    .transform(v => (v == null || v.trim().length === 0 ? null : v.trim())),
  color: cardOverlayColorSchema,
  paths: z.string().transform((value, ctx) => {
    try {
      return cardOverlayPathsSchema.parse(JSON.parse(value))
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Polygone invalide' })
      return z.NEVER
    }
  }),
})

const updateSchema = z.object({
  intent: z.literal('update'),
  id: z.coerce.number().int().positive(),
  name: cardOverlayNameSchema,
  color: cardOverlayColorSchema,
  paths: z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (value == null || value.length === 0) return undefined
      try {
        return cardOverlayPathsSchema.parse(JSON.parse(value))
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Polygone invalide' })
        return z.NEVER
      }
    }),
})

const deleteSchema = z.object({
  intent: z.literal('delete'),
  id: z.coerce.number().int().positive(),
})

const importSchema = z.object({
  intent: z.literal('import-geojson'),
  geojson: z.string().min(1),
})

const setPerimeterSchema = z.object({
  intent: z.literal('set-perimeter'),
  paths: z.string().transform((value, ctx) => {
    try {
      return cardOverlayPathsSchema.parse(JSON.parse(value))
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Polygone invalide' })
      return z.NEVER
    }
  }),
})

const clearPerimeterSchema = z.object({
  intent: z.literal('clear-perimeter'),
})

const actionSchema = z.discriminatedUnion('intent', [
  createSchema,
  updateSchema,
  deleteSchema,
  importSchema,
  setPerimeterSchema,
  clearPerimeterSchema,
])

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Permission.TerritoriesManager)) {
    throw redirect('/')
  }
  const currentUser = context.get(currentAccountContext)
  const congregation = context.get(congregationContext)
  const formData = await request.formData()
  const parsed = actionSchema.safeParse(Object.fromEntries(formData.entries()))
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Données invalides' }
  }

  return withScopeFromContext(context, async db => {
    const limits = new LimitService(db, congregation)

    if (parsed.data.intent === 'create') {
      await limits.errorIfWouldGoOverLimit('cardOverlays')
      await createCardOverlay(db, {
        name: parsed.data.name,
        color: parsed.data.color,
        paths: parsed.data.paths,
        congregationId: congregation.id,
        actorId: currentUser.id,
      })
      return redirect('/settings/territories/card-overlays')
    }

    if (parsed.data.intent === 'update') {
      await updateCardOverlay(db, parsed.data.id, {
        name: parsed.data.name,
        color: parsed.data.color,
        ...(parsed.data.paths != null ? { paths: parsed.data.paths } : {}),
        congregationId: congregation.id,
        actorId: currentUser.id,
      })
      return redirect('/settings/territories/card-overlays')
    }

    if (parsed.data.intent === 'delete') {
      await deleteCardOverlay(db, parsed.data.id, congregation.id, currentUser.id)
      return redirect('/settings/territories/card-overlays')
    }

    if (parsed.data.intent === 'set-perimeter') {
      await setPerimeter(db, {
        paths: parsed.data.paths,
        congregationId: congregation.id,
        actorId: currentUser.id,
      })
      return redirect('/settings/territories/card-overlays')
    }

    if (parsed.data.intent === 'clear-perimeter') {
      await clearPerimeter(db, congregation.id, currentUser.id)
      return redirect('/settings/territories/card-overlays')
    }

    // import-geojson — accepts both zones (appended to the existing list) and an optional perimeter
    // (replaces any existing one; setPerimeter is upsert by congregationId).
    let imported: ReturnType<typeof parseGeoJsonImport>
    try {
      imported = parseGeoJsonImport(JSON.parse(parsed.data.geojson))
    } catch (error) {
      return { error: error instanceof GeoJsonValidationError ? error.message : 'GeoJSON invalide' }
    }
    if (imported.perimeter != null) {
      await setPerimeter(db, {
        paths: imported.perimeter,
        congregationId: congregation.id,
        actorId: currentUser.id,
      })
    }
    for (const draft of imported.zones) {
      await limits.errorIfWouldGoOverLimit('cardOverlays')
      await createCardOverlay(db, {
        name: draft.name,
        color: draft.color,
        paths: draft.paths,
        congregationId: congregation.id,
        actorId: currentUser.id,
      })
    }
    return redirect('/settings/territories/card-overlays')
  })
}

export default function CardOverlaysSettingsPage({ loaderData, actionData }: Route.ComponentProps) {
  const { overlays, perimeter, googleMapsApiKey, maxOverlays } = loaderData
  const atLimit = maxOverlays != null && overlays.length >= maxOverlays
  const fetcher = useFetcher()
  const [editingId, setEditingId] = useState<number | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [perimeterMode, setPerimeterMode] = useState<'new' | 'edit' | null>(null)
  const [draftPaths, setDraftPaths] = useState<CardOverlayPath[] | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftColor, setDraftColor] = useState(DEFAULT_OVERLAY_COLOR)
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false)
  const [draftDirty, setDraftDirty] = useState(false)
  const { blocker, markDirty } = useUnsavedChanges()

  const hasMapApiKey = googleMapsApiKey != null && googleMapsApiKey.length > 0
  const hasPerimeter = perimeter != null
  const editingOverlay = editingId == null ? null : (overlays.find(o => o.id === editingId) ?? null)
  const isDraftActive = isDrawing || editingId != null || perimeterMode != null
  const editingPerimeter = perimeterMode != null
  const initialCenter =
    perimeterMode === 'edit' && perimeter?.paths[0] != null
      ? { lat: perimeter.paths[0].lat, lng: perimeter.paths[0].lng }
      : editingOverlay?.paths[0] != null
        ? { lat: editingOverlay.paths[0].lat, lng: editingOverlay.paths[0].lng }
        : perimeter?.paths[0] != null
          ? { lat: perimeter.paths[0].lat, lng: perimeter.paths[0].lng }
          : overlays[0]?.paths[0] != null
            ? { lat: overlays[0].paths[0].lat, lng: overlays[0].paths[0].lng }
            : undefined

  function markDraftDirty() {
    setDraftDirty(true)
    markDirty()
  }

  function startDrawing() {
    setEditingId(null)
    setPerimeterMode(null)
    setDraftPaths(null)
    setDraftName('')
    setDraftColor(DEFAULT_OVERLAY_COLOR)
    setDraftDirty(false)
    setIsDrawing(true)
  }

  function startEditing(overlay: CardOverlay) {
    setEditingId(overlay.id)
    setIsDrawing(false)
    setPerimeterMode(null)
    setDraftPaths(overlay.paths)
    setDraftName(overlay.name ?? '')
    setDraftColor(overlay.color)
    setDraftDirty(false)
  }

  function startEditingPerimeter() {
    if (perimeter == null) return
    setEditingId(null)
    setIsDrawing(false)
    setPerimeterMode('edit')
    setDraftPaths(perimeter.paths)
    setDraftName('')
    setDraftColor(PERIMETER_DRAFT_COLOR)
    setDraftDirty(false)
  }

  function startNewPerimeter() {
    setEditingId(null)
    setIsDrawing(false)
    setPerimeterMode('new')
    setDraftPaths(null)
    setDraftName('')
    setDraftColor(PERIMETER_DRAFT_COLOR)
    setDraftDirty(false)
  }

  function exitDraftMode() {
    setIsDrawing(false)
    setEditingId(null)
    setPerimeterMode(null)
    setDraftPaths(null)
    setDraftName('')
    setDraftColor(DEFAULT_OVERLAY_COLOR)
    setDraftDirty(false)
  }

  function handleCancelClick() {
    if (draftDirty) {
      setConfirmCancelOpen(true)
      return
    }
    exitDraftMode()
  }

  function handleDraftChange(paths: CardOverlayPath[]) {
    setDraftPaths(paths)
    markDraftDirty()
  }

  // After a successful create/update submit, exit draft mode so the freshly loaded row
  // shows up in the list rather than the stale local draft. Inlined (rather than calling
  // exitDraftMode) so the effect's dependency array stays stable.
  const navigation = useNavigation()
  const wasSubmittingRef = useRef(false)
  useEffect(() => {
    const isSubmitting =
      navigation.state === 'submitting' &&
      navigation.formMethod === 'POST' &&
      navigation.formAction?.endsWith('/card-overlays')
    if (isSubmitting) {
      wasSubmittingRef.current = true
      return
    }
    if (wasSubmittingRef.current && navigation.state === 'idle') {
      wasSubmittingRef.current = false
      setIsDrawing(false)
      setEditingId(null)
      setPerimeterMode(null)
      setDraftPaths(null)
      setDraftName('')
      setDraftColor(DEFAULT_OVERLAY_COLOR)
      setDraftDirty(false)
    }
  }, [navigation.state, navigation.formMethod, navigation.formAction])

  function downloadExport() {
    const collection = buildGeoJsonExport(overlays, perimeter?.paths ?? null)
    const blob = new Blob([JSON.stringify(collection, null, 2)], { type: 'application/geo+json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'unitae-territory-card-overlays.geojson'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

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
                onClick={downloadExport}
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
              className="h-[480px] w-full overflow-hidden rounded-lg border data-[drawing=true]:ring-2 data-[drawing=true]:ring-primary/40 transition"
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
          <Card>
            <CardHeader>
              <CardTitle>
                {perimeterMode != null
                  ? perimeterMode === 'edit'
                    ? m.settings_territories_card_overlays_perimeter_editing_banner()
                    : m.settings_territories_card_overlays_perimeter_drawing_title()
                  : editingId != null
                    ? editingOverlay?.name != null && editingOverlay.name.length > 0
                      ? m.settings_territories_card_overlays_editing_banner_named({ name: editingOverlay.name })
                      : m.settings_territories_card_overlays_editing_banner_unnamed()
                    : m.settings_territories_card_overlays_new_button()}
              </CardTitle>
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
                <Form method="post" className="flex flex-wrap items-end gap-4" onChange={markDirty}>
                  <input
                    type="hidden"
                    name="intent"
                    value={perimeterMode != null ? 'set-perimeter' : editingId == null ? 'create' : 'update'}
                  />
                  {editingId != null && perimeterMode == null ? (
                    <input type="hidden" name="id" value={editingId} />
                  ) : null}
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
                            setDraftName(e.target.value)
                            markDirty()
                          }}
                          placeholder={m.settings_territories_card_overlays_name_placeholder()}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="card-overlay-color">{m.settings_territories_card_overlays_color_label()}</Label>
                        <ColorPicker
                          id="card-overlay-color"
                          value={draftColor}
                          onChange={value => {
                            setDraftColor(value)
                            markDraftDirty()
                          }}
                        />
                      </div>
                    </>
                  ) : null}
                  <Button type="submit">{m.settings_territories_card_overlays_save()}</Button>
                </Form>
              )}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>{m.settings_territories_card_overlays_perimeter_section_title()}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-muted-foreground text-sm">
              {m.settings_territories_card_overlays_perimeter_section_subtitle()}
            </p>
            {hasPerimeter && perimeter != null ? (
              <div
                className="flex flex-wrap items-center gap-3 rounded-md border-l-4 bg-card py-2 pr-2 pl-3 shadow-sm"
                style={{ borderLeftColor: PERIMETER_DRAFT_COLOR }}
              >
                <div
                  className="size-6 rounded-full border"
                  style={{ backgroundColor: PERIMETER_DRAFT_COLOR }}
                  role="img"
                  aria-label={m.settings_territories_card_overlays_perimeter_section_title()}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{m.settings_territories_card_overlays_perimeter_section_title()}</p>
                </div>
                <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs">
                  {verticesCount(perimeter.paths.length)}
                </span>
                {hasMapApiKey ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={startEditingPerimeter}
                    disabled={perimeterMode === 'edit'}
                    aria-label={m.settings_territories_card_overlays_perimeter_edit_button()}
                  >
                    <Spline aria-hidden className="size-4" />
                    <span className="sr-only sm:not-sr-only">
                      {m.settings_territories_card_overlays_perimeter_edit_button()}
                    </span>
                  </Button>
                ) : null}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      aria-label={m.settings_territories_card_overlays_perimeter_delete_button()}
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {m.settings_territories_card_overlays_perimeter_delete_confirm_title()}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {m.settings_territories_card_overlays_perimeter_delete_confirm_description()}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{m.settings_territories_card_overlays_cancel()}</AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        onClick={() => {
                          // Programmatic submit — see the zone delete handler for the rationale.
                          fetcher.submit({ intent: 'clear-perimeter' }, { method: 'post' })
                        }}
                      >
                        {m.settings_territories_card_overlays_perimeter_delete_button()}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-muted-foreground text-sm italic">
                  {m.settings_territories_card_overlays_perimeter_undefined()}
                </p>
                {hasMapApiKey ? (
                  <Button
                    type="button"
                    onClick={startNewPerimeter}
                    disabled={perimeterMode === 'new'}
                    className="self-start"
                  >
                    {m.settings_territories_card_overlays_perimeter_set_button()}
                  </Button>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{m.settings_territories_card_overlays_list_title()}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {overlays.length === 0 ? (
              <p className="text-muted-foreground text-sm">{m.settings_territories_card_overlays_empty()}</p>
            ) : (
              overlays.map(overlay => (
                <OverlayRow
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

        <Dialog open={importOpen} onOpenChange={setImportOpen}>
          <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden">
            <DialogHeader>
              <DialogTitle>{m.settings_territories_card_overlays_import_dialog_title()}</DialogTitle>
              <DialogDescription>{m.settings_territories_card_overlays_import_dialog_description()}</DialogDescription>
            </DialogHeader>
            <Form
              method="post"
              onSubmit={() => {
                setImportOpen(false)
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
                  accept=".geojson,application/geo+json,application/json"
                  onChange={async event => {
                    const file = event.target.files?.[0]
                    if (file == null) return
                    const text = await file.text()
                    setImportText(text)
                  }}
                />
                <p className="text-muted-foreground text-xs">
                  {m.settings_territories_card_overlays_import_or_paste()}
                </p>
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
                <Button type="button" variant="outline" onClick={() => setImportOpen(false)}>
                  {m.settings_territories_card_overlays_cancel()}
                </Button>
                <Button type="submit">{m.settings_territories_card_overlays_save()}</Button>
              </DialogFooter>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}

function OverlayRow({
  overlay,
  fetcher,
  canEditShape,
  onStartEditing,
  isEditing,
}: {
  overlay: CardOverlay
  fetcher: ReturnType<typeof useFetcher>
  canEditShape: boolean
  onStartEditing: () => void
  isEditing: boolean
}) {
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
