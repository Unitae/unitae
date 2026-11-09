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

/** A dynamic document's form, edited. Its appearance and a programme's content travel with it. */
export const dynamicDocumentSchema = z.object({
  title: z
    .string({ error: () => m.board_form_title_required() })
    .trim()
    .min(1, { error: () => m.board_form_title_required() }),
  sectionId: z.coerce.number(),
  ...displayWindowFields,
  dynamicConfig: z.string().optional(),
  appearance: appearanceInputSchema.optional(),
})

/** The same form for a new one, which also says what it shows. */
export const newDynamicDocumentSchema = dynamicDocumentSchema.extend({
  dynamicType: z.string().min(1),
  dynamicRef: z.string().optional().default(''),
})

export const restoreVersionSchema = z.object({
  versionId: z.coerce.number(),
})

export type PdfDocumentInput = z.infer<typeof pdfDocumentSchema>
export type DynamicDocumentInput = z.infer<typeof dynamicDocumentSchema>
export type RestoreVersionInput = z.infer<typeof restoreVersionSchema>
