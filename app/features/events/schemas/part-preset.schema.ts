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

export const partPresetSchema = z.object({
  // Blank means "use the built-in name", which is why this is no longer
  // required: the placeholder in the form shows what blank will produce.
  name: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform(v => (v == null || v === '' ? null : v)),
  speakerLabel: slotLabelField,
  readerLabel: slotLabelField,
  hasReaderSlot: checkboxField,
  allowExternalSpeaker: checkboxField,
  shareMessage: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform(v => (v == null || v === '' ? null : v))
    // Catch placeholder typos at save time. Without this a mistyped
    // {{prenom}} renders as an empty gap in a message that has already been
    // sent to someone — the defect surfaces on their phone, not in the editor.
    .superRefine((value, ctx) => {
      if (value == null) return
      const unknown = findUnknownVariables(value)
      if (unknown.length === 0) return
      ctx.addIssue({
        code: 'custom',
        message: `Variable(s) inconnue(s) : ${unknown.map(name => `{{${name}}}`).join(', ')}. Disponibles : ${SHARE_VARIABLES.map(name => `{{${name}}}`).join(', ')}`,
      })
    }),
})

export type PartPresetFormValues = z.infer<typeof partPresetSchema>
