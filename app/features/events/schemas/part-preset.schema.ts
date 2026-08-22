import { z } from 'zod'
import { findUnknownVariables, SHARE_VARIABLES } from '~/features/events/model/share-message'

// Blank input means "use the generic i18n default", matching how the per-part
// labels behave — see app/features/events/model/part-labels.ts.
const slotLabelField = z
  .string()
  .trim()
  .max(50)
  .optional()
  .transform(v => (v == null || v === '' ? null : v))

const checkboxField = z
  .string()
  .optional()
  .transform(v => v === 'on')

// Same shape as the part form's role fields — a single value arrives as a
// string, several as an array, and nothing at all as an empty selection.
const roleIdsField = z.preprocess(
  v => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]),
  z.array(z.coerce.number().int().positive()),
)

export const partPresetSchema = z.object({
  name: z.string().trim().min(1).max(80),
  speakerLabel: slotLabelField,
  readerLabel: slotLabelField,
  hasReaderSlot: checkboxField,
  allowExternalSpeaker: checkboxField,
  shareMessage: z
    .string()
    .trim()
    .min(1)
    .max(1000)
    // Catch placeholder typos at save time. Without this a mistyped
    // {{prenom}} renders as an empty gap in a message that has already been
    // sent to someone — the defect surfaces on their phone, not in the editor.
    .superRefine((value, ctx) => {
      const unknown = findUnknownVariables(value)
      if (unknown.length === 0) return
      ctx.addIssue({
        code: 'custom',
        message: `Variable(s) inconnue(s) : ${unknown.map(name => `{{${name}}}`).join(', ')}. Disponibles : ${SHARE_VARIABLES.map(name => `{{${name}}}`).join(', ')}`,
      })
    }),
  allowedSpeakerRoleIds: roleIdsField.default([]),
  allowedReaderRoleIds: roleIdsField.default([]),
})

export type PartPresetFormValues = z.infer<typeof partPresetSchema>
