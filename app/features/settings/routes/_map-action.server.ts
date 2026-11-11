import { z } from 'zod'
import {
  cardOverlayColorSchema,
  cardOverlayNameSchema,
  cardOverlayPathsSchema,
  GeoJsonValidationError,
  parseGeoJsonImport,
} from '~/features/territories'
import {
  clearPerimeter,
  createCardOverlay,
  deleteCardOverlay,
  setPerimeter,
  updateCardOverlay,
} from '~/features/territories/index.server'
import * as m from '~/i18n/paraglide/messages'
import type { LimitService } from '~/shared/domain/limits.server'
import type { TransactionClient } from '~/shared/infra/db.server'

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

export const cardOverlayActionSchema = z.discriminatedUnion('intent', [
  createSchema,
  updateSchema,
  deleteSchema,
  importSchema,
  setPerimeterSchema,
  clearPerimeterSchema,
])

/** What an intent did, for the toast; or why it did not, kept under the form so nothing drawn is lost. */
export type MapActionResult = { ok: true; message: string } | { ok: false; error: string }

export async function handleCardOverlayAction(
  db: TransactionClient,
  limits: LimitService,
  data: z.infer<typeof cardOverlayActionSchema>,
  congregationId: number,
  actorId: number,
): Promise<MapActionResult> {
  if (data.intent === 'create') {
    await limits.errorIfWouldGoOverLimit('cardOverlays')
    await createCardOverlay(db, { name: data.name, color: data.color, paths: data.paths, congregationId, actorId })
    return { ok: true, message: m.settings_map_zone_saved() }
  }

  if (data.intent === 'update') {
    await updateCardOverlay(db, data.id, {
      name: data.name,
      color: data.color,
      ...(data.paths != null ? { paths: data.paths } : {}),
      congregationId,
      actorId,
    })
    return { ok: true, message: m.settings_map_zone_saved() }
  }

  if (data.intent === 'delete') {
    await deleteCardOverlay(db, data.id, congregationId, actorId)
    return { ok: true, message: m.settings_map_zone_deleted() }
  }

  if (data.intent === 'set-perimeter') {
    await setPerimeter(db, { paths: data.paths, congregationId, actorId })
    return { ok: true, message: m.settings_map_perimeter_saved() }
  }

  if (data.intent === 'clear-perimeter') {
    await clearPerimeter(db, congregationId, actorId)
    return { ok: true, message: m.settings_map_perimeter_cleared() }
  }

  // import-geojson — accepts both zones (appended to the existing list) and an optional perimeter
  // (replaces any existing one; setPerimeter is upsert by congregationId).
  let imported: ReturnType<typeof parseGeoJsonImport>
  try {
    imported = parseGeoJsonImport(JSON.parse(data.geojson))
  } catch (error) {
    return { ok: false, error: error instanceof GeoJsonValidationError ? error.message : m.geojson_error_invalid() }
  }
  if (imported.perimeter != null) {
    await setPerimeter(db, { paths: imported.perimeter, congregationId, actorId })
  }
  for (const draft of imported.zones) {
    await limits.errorIfWouldGoOverLimit('cardOverlays')
    await createCardOverlay(db, { name: draft.name, color: draft.color, paths: draft.paths, congregationId, actorId })
  }
  return { ok: true, message: m.settings_map_imported() }
}
