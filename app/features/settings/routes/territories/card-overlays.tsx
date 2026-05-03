import { useEffect, useRef, useState } from 'react'
import { Form, redirect, useFetcher, useNavigation } from 'react-router'
import { z } from 'zod'
import {
  type CardOverlay,
  type CardOverlayPath,
  cardOverlayColorSchema,
  cardOverlayNameSchema,
  cardOverlayPathsSchema,
  cardOverlaysToGeoJson,
  GeoJsonValidationError,
  geoJsonToCardOverlays,
} from '~/features/territories/model/card-overlay'
import {
  createCardOverlay,
  deleteCardOverlay,
  listCardOverlays,
  updateCardOverlay,
} from '~/features/territories/server/card-overlays.server'
import CardOverlayMap from '~/features/territories/ui/CardOverlayMap'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  permissionsContext,
  userContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { LimitService } from '~/shared/domain/limits.server'
import { Role } from '~/shared/types/role'
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/shared/ui/dialog'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Textarea } from '~/shared/ui/textarea'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { getOptionalEnv } from '~/shared/utils/env.server'

import type { Route } from './+types/card-overlays'

const DEFAULT_OVERLAY_COLOR = '#C2175B'

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
  if (!permissions.has(Role.TerritoriesManager)) {
    throw redirect('/')
  }

  return withScopeFromContext(context, async db => {
    const overlays = await listCardOverlays(db)
    return {
      overlays,
      googleMapsApiKey: getOptionalEnv('GOOGLE_MAPS_API_KEY'),
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

const actionSchema = z.discriminatedUnion('intent', [createSchema, updateSchema, deleteSchema, importSchema])

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Role.TerritoriesManager)) {
    throw redirect('/')
  }
  const currentUser = context.get(userContext)
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

    // import-geojson
    let drafts: ReturnType<typeof geoJsonToCardOverlays>
    try {
      drafts = geoJsonToCardOverlays(JSON.parse(parsed.data.geojson))
    } catch (error) {
      return { error: error instanceof GeoJsonValidationError ? error.message : 'GeoJSON invalide' }
    }
    for (const draft of drafts) {
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
  const { overlays, googleMapsApiKey } = loaderData
  const fetcher = useFetcher()
  const [editingId, setEditingId] = useState<number | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [draftPaths, setDraftPaths] = useState<CardOverlayPath[] | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftColor, setDraftColor] = useState(DEFAULT_OVERLAY_COLOR)
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false)
  const [draftDirty, setDraftDirty] = useState(false)
  const { blocker, markDirty } = useUnsavedChanges()

  const hasMapApiKey = googleMapsApiKey != null && googleMapsApiKey.length > 0
  const editingOverlay = editingId == null ? null : (overlays.find(o => o.id === editingId) ?? null)
  const isDraftActive = isDrawing || editingId != null
  const initialCenter =
    editingOverlay?.paths[0] != null
      ? { lat: editingOverlay.paths[0].lat, lng: editingOverlay.paths[0].lng }
      : overlays[0]?.paths[0] != null
        ? { lat: overlays[0].paths[0].lat, lng: overlays[0].paths[0].lng }
        : undefined

  function markDraftDirty() {
    setDraftDirty(true)
    markDirty()
  }

  function startDrawing() {
    setEditingId(null)
    setDraftPaths(null)
    setDraftName('')
    setDraftColor(DEFAULT_OVERLAY_COLOR)
    setDraftDirty(false)
    setIsDrawing(true)
  }

  function startEditing(overlay: CardOverlay) {
    setEditingId(overlay.id)
    setIsDrawing(false)
    setDraftPaths(overlay.paths)
    setDraftName(overlay.name ?? '')
    setDraftColor(overlay.color)
    setDraftDirty(false)
  }

  function exitDraftMode() {
    setIsDrawing(false)
    setEditingId(null)
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
      setDraftPaths(null)
      setDraftName('')
      setDraftColor(DEFAULT_OVERLAY_COLOR)
      setDraftDirty(false)
    }
  }, [navigation.state, navigation.formMethod, navigation.formAction])

  function downloadExport() {
    const collection = cardOverlaysToGeoJson(overlays)
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
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.settings_territories_card_overlays_title()}
        subtitle={m.settings_territories_card_overlays_subtitle()}
        breadcrumbs={[
          { label: m.sidebar_settings(), to: '/settings' },
          { label: m.sidebar_settings_territories(), to: '/settings/territories' },
          { label: m.settings_territories_card_overlays_title() },
        ]}
      />

      {actionData != null && 'error' in actionData ? (
        <Card>
          <CardContent className="p-4 text-destructive text-sm">{actionData.error}</CardContent>
        </Card>
      ) : null}

      <UnsavedChangesDialog blocker={blocker} />

      <div className="flex flex-wrap gap-2">
        {hasMapApiKey ? (
          !isDraftActive ? (
            <Button type="button" onClick={startDrawing}>
              {m.settings_territories_card_overlays_new_button()}
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={handleCancelClick}>
              {m.settings_territories_card_overlays_cancel()}
            </Button>
          )
        ) : null}
        <Button type="button" variant="outline" onClick={() => setImportOpen(true)}>
          {m.settings_territories_card_overlays_import_button()}
        </Button>
        <Button type="button" variant="outline" onClick={downloadExport} disabled={overlays.length === 0}>
          {m.settings_territories_card_overlays_export_button()}
        </Button>
      </div>

      {hasMapApiKey ? (
        <CardOverlayMap
          apiKey={googleMapsApiKey}
          overlays={overlays}
          excludeOverlayId={editingId}
          drawingEnabled={isDrawing && draftPaths == null}
          draftPaths={draftPaths}
          draftColor={draftColor}
          onDraftChange={handleDraftChange}
          initialCenter={initialCenter}
          initialZoom={initialCenter == null ? undefined : 13}
          className="h-[480px] w-full overflow-hidden rounded-lg border"
        />
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
              {editingId != null
                ? editingOverlay?.name != null && editingOverlay.name.length > 0
                  ? m.settings_territories_card_overlays_editing_banner_named({ name: editingOverlay.name })
                  : m.settings_territories_card_overlays_editing_banner_unnamed()
                : m.settings_territories_card_overlays_new_button()}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {editingId == null ? (
              <p className="text-muted-foreground text-sm">{m.settings_territories_card_overlays_drawing_hint()}</p>
            ) : null}
            {draftPaths == null ? (
              <p className="text-muted-foreground text-sm italic">
                {m.settings_territories_card_overlays_no_polygon_drawn()}
              </p>
            ) : (
              <Form method="post" className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end" onChange={markDirty}>
                <input type="hidden" name="intent" value={editingId == null ? 'create' : 'update'} />
                {editingId != null ? <input type="hidden" name="id" value={editingId} /> : null}
                <input type="hidden" name="paths" value={JSON.stringify(draftPaths)} />
                <div className="space-y-2">
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
                  <Input
                    id="card-overlay-color"
                    name="color"
                    type="color"
                    value={draftColor}
                    onChange={e => {
                      setDraftColor(e.target.value)
                      markDirty()
                    }}
                    className="h-10 w-16 cursor-pointer p-1"
                  />
                </div>
                <Button type="submit">{m.settings_territories_card_overlays_save()}</Button>
              </Form>
            )}
          </CardContent>
        </Card>
      ) : null}

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
            <Label htmlFor="card-overlay-geojson">{m.settings_territories_card_overlays_import_paste_label()}</Label>
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
  const [name, setName] = useState(overlay.name ?? '')
  const [color, setColor] = useState(overlay.color)
  const displayName = overlay.name != null && overlay.name.length > 0 ? overlay.name : null
  const colorAriaLabel = `${m.settings_territories_card_overlays_color_label()} : ${overlay.color}`
  return (
    <div
      className="grid gap-3 rounded border p-3 data-[editing=true]:border-primary data-[editing=true]:ring-2 data-[editing=true]:ring-primary/30 sm:grid-cols-[auto_1fr_auto_auto_auto] sm:items-end"
      data-editing={isEditing ? 'true' : undefined}
    >
      <div className="size-10 rounded border" style={{ backgroundColor: overlay.color }} role="img" aria-label={colorAriaLabel} />
      <div className="space-y-1">
        <Label htmlFor={`overlay-${overlay.id}-name`}>{m.settings_territories_card_overlays_name_label()}</Label>
        <Input
          id={`overlay-${overlay.id}-name`}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={m.settings_territories_card_overlays_name_placeholder()}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`overlay-${overlay.id}-color`}>{m.settings_territories_card_overlays_color_label()}</Label>
        <Input
          id={`overlay-${overlay.id}-color`}
          type="color"
          value={color}
          onChange={e => setColor(e.target.value)}
          className="h-10 w-16 cursor-pointer p-1"
        />
      </div>
      <p className="text-muted-foreground text-xs">{verticesCount(overlay.paths.length)}</p>
      <div className="flex flex-wrap gap-2">
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="update" />
          <input type="hidden" name="id" value={overlay.id} />
          <input type="hidden" name="name" value={name} />
          <input type="hidden" name="color" value={color} />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            aria-label={`${m.settings_territories_card_overlays_save()} ${displayName ?? `#${overlay.id}`}`}
          >
            {m.settings_territories_card_overlays_save()}
          </Button>
        </fetcher.Form>
        {canEditShape ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onStartEditing}
            disabled={isEditing}
            aria-label={`${m.settings_territories_card_overlays_edit_shape()} ${displayName ?? `#${overlay.id}`}`}
          >
            {m.settings_territories_card_overlays_edit_shape()}
          </Button>
        ) : null}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              aria-label={`${m.settings_territories_card_overlays_delete()} ${displayName ?? `#${overlay.id}`}`}
            >
              {m.settings_territories_card_overlays_delete()}
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
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="delete" />
              <input type="hidden" name="id" value={overlay.id} />
              <AlertDialogFooter>
                <AlertDialogCancel>{m.settings_territories_card_overlays_cancel()}</AlertDialogCancel>
                <AlertDialogAction type="submit" variant="destructive">
                  {m.settings_territories_card_overlays_delete_confirm_action()}
                </AlertDialogAction>
              </AlertDialogFooter>
            </fetcher.Form>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
