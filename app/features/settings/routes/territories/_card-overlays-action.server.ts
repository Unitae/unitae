import { redirect } from 'react-router'
import { z } from 'zod'
import {
  cardOverlayColorSchema,
  cardOverlayNameSchema,
  cardOverlayPathsSchema,
  clearPerimeter,
  createCardOverlay,
  deleteCardOverlay,
  GeoJsonValidationError,
  parseGeoJsonImport,
  setPerimeter,
  updateCardOverlay,
} from '~/features/territories'
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

const REDIRECT_TARGET = '/settings/territories/card-overlays'

export async function handleCardOverlayAction(
  db: TransactionClient,
  limits: LimitService,
  data: z.infer<typeof cardOverlayActionSchema>,
  congregationId: number,
  actorId: number,
): Promise<{ error: string } | Response> {
  if (data.intent === 'create') {
    await limits.errorIfWouldGoOverLimit('cardOverlays')
    await createCardOverlay(db, {
      name: data.name,
      color: data.color,
      paths: data.paths,
      congregationId,
      actorId,
    })
    return redirect(REDIRECT_TARGET)
  }

  if (data.intent === 'update') {
    await updateCardOverlay(db, data.id, {
      name: data.name,
      color: data.color,
      ...(data.paths != null ? { paths: data.paths } : {}),
      congregationId,
      actorId,
    })
    return redirect(REDIRECT_TARGET)
  }

  if (data.intent === 'delete') {
    await deleteCardOverlay(db, data.id, congregationId, actorId)
    return redirect(REDIRECT_TARGET)
  }

  if (data.intent === 'set-perimeter') {
    await setPerimeter(db, { paths: data.paths, congregationId, actorId })
    return redirect(REDIRECT_TARGET)
  }

  if (data.intent === 'clear-perimeter') {
    await clearPerimeter(db, congregationId, actorId)
    return redirect(REDIRECT_TARGET)
  }

  // import-geojson — accepts both zones (appended to the existing list) and an optional perimeter
  // (replaces any existing one; setPerimeter is upsert by congregationId).
  let imported: ReturnType<typeof parseGeoJsonImport>
  try {
    imported = parseGeoJsonImport(JSON.parse(data.geojson))
  } catch (error) {
    return { error: error instanceof GeoJsonValidationError ? error.message : 'GeoJSON invalide' }
  }
  if (imported.perimeter != null) {
    await setPerimeter(db, { paths: imported.perimeter, congregationId, actorId })
  }
  for (const draft of imported.zones) {
    await limits.errorIfWouldGoOverLimit('cardOverlays')
    await createCardOverlay(db, {
      name: draft.name,
      color: draft.color,
      paths: draft.paths,
      congregationId,
      actorId,
    })
  }
  return redirect(REDIRECT_TARGET)
}
