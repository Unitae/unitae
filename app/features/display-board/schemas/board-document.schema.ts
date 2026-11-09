import { z } from 'zod'
import { appearanceInputSchema } from '~/features/display-board/schemas/appearance.schema'
import * as m from '~/i18n/paraglide/messages'

/**
 * When a document shows, as the form posts it: by day, read in the congregation's zone (see
 * `toDisplayWindow`). Only a reviewer's form carries these; the server ignores them otherwise.
 */
export const displayWindowFields = {
  show: z.enum(['now', 'from', 'later']).default('now'),
  from: z.string().optional().default(''),
  until: z.string().optional().default(''),
  highlighted: z.literal('on').optional(),
}

/** A PDF's form, new or edited. The file travels apart, through the multipart parser. */
export const pdfDocumentSchema = z.object({
  title: z
    .string({ error: () => m.board_form_title_required() })
    .trim()
    .min(1, { error: () => m.board_form_title_required() }),
  sectionId: z.coerce.number(),
  ...displayWindowFields,
})

export const createDynamicDocumentSchema = z.object({
  dynamicType: z.string().min(1),
  dynamicRef: z.string().optional().default(''),
  title: z.string().min(1),
})

export const updateDynamicDocumentSchema = z.object({
  title: z
    .string()
    .min(1)
    .transform(v => v.trim()),
  sectionId: z.coerce.number(),
  'visible-from': z.string().optional().default(''),
  'visible-until': z.string().optional().default(''),
  hightlighted: z.string().optional(),
  showServices: z.string().optional(),
  dynamicConfig: z.string().optional(),
  appearance: appearanceInputSchema.optional(),
})

export const restoreVersionSchema = z.object({
  versionId: z.coerce.number(),
})

export type PdfDocumentInput = z.infer<typeof pdfDocumentSchema>
export type CreateDynamicDocumentInput = z.infer<typeof createDynamicDocumentSchema>
export type UpdateDynamicDocumentInput = z.infer<typeof updateDynamicDocumentSchema>
export type RestoreVersionInput = z.infer<typeof restoreVersionSchema>
