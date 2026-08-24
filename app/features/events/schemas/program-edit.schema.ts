import { z } from 'zod'
import { MANAGED_ROLE_SLOTS_FIELD } from '~/features/events/model/allowed-roles-write'

const roleIdsField = z.preprocess(
  v => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]),
  z.array(z.coerce.number().int().positive()),
)

// Which role pickers the editor actually drew. Absent means it drew none, so
// every stored row is left alone — never "it drew both and they were empty".
// See partAllowedRolesToWrite for why the two must stay distinguishable.
const managedRoleSlotsField = z.preprocess(
  v => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]),
  z.array(z.string()),
)

// Free-text per-part display labels — capped at 50 to keep DB rows sensible
// and prevent accidental novellas. Blank/empty admin input yields undefined so
// the fallback default (i18n key) surfaces via the part-labels helper.
const partRoleLabelField = z
  .string()
  .trim()
  .max(50)
  .optional()
  .transform(v => (v == null || v === '' ? undefined : v))

// Which kind of part this is. The <select> submits '' for the blank "no kind"
// option and the field is absent when the form omits it; both mean "no preset",
// and both must land as an explicit null. Letting z.coerce.number() see '' would
// produce 0 — a dangling foreign key — and letting it stay undefined would leave
// a previously chosen preset silently in place.
// Radix's Select forbids an empty-string item value, so the "no kind" option
// carries this sentinel instead. It means exactly what '' and an absent field
// mean: no preset.
export const NO_PRESET_VALUE = 'none'

const partPresetField = z.preprocess(
  v => (v == null || v === '' || v === NO_PRESET_VALUE ? null : v),
  z.coerce.number().int().positive().nullable(),
)

export const updateEventSchema = z.object({
  intent: z.literal('update-event'),
  name: z.string().min(1),
  date: z.string().min(1),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
})

export const addPartSchema = z.object({
  intent: z.literal('add-part'),
  partName: z.string().min(1),
  partSection: z.string().optional().default(''),
  partTrack: z.string().optional().default(''),
  partTrackOrder: z.coerce.number().optional(),
  partOrder: z.coerce.number().default(0),
  partDuration: z.coerce.number().optional(),
  partAllowExternalSpeaker: z
    .string()
    .optional()
    .transform(v => v === 'on'),
  partSpeakerLabel: partRoleLabelField,
  partReaderLabel: partRoleLabelField,
  partPresetId: partPresetField,
  allowedSpeakerRoleIds: roleIdsField.default([]),
  allowedReaderRoleIds: roleIdsField.default([]),
  [MANAGED_ROLE_SLOTS_FIELD]: managedRoleSlotsField.default([]),
})

export const deletePartSchema = z.object({
  intent: z.literal('delete-part'),
  partAssignmentId: z.coerce.number(),
})

export const addServiceSchema = z.object({
  intent: z.literal('add-service'),
  serviceName: z.string().min(1),
  allowedRoleIds: roleIdsField.default([]),
})

export const deleteServiceSchema = z.object({
  intent: z.literal('delete-service'),
  serviceAssignmentId: z.coerce.number(),
})

export const updatePartSchema = z.object({
  intent: z.literal('update-part'),
  partAssignmentId: z.coerce.number(),
  partName: z.string().min(1),
  partSection: z.string().optional().default(''),
  partTrack: z.string().optional().default(''),
  partTrackOrder: z.coerce.number().optional(),
  partOrder: z.coerce.number().default(0),
  partDuration: z.coerce.number().optional(),
  partAllowExternalSpeaker: z
    .string()
    .optional()
    .transform(v => v === 'on'),
  partSpeakerLabel: partRoleLabelField,
  partReaderLabel: partRoleLabelField,
  partPresetId: partPresetField,
  allowedSpeakerRoleIds: roleIdsField.default([]),
  allowedReaderRoleIds: roleIdsField.default([]),
  [MANAGED_ROLE_SLOTS_FIELD]: managedRoleSlotsField.default([]),
})

export const updateServiceSchema = z.object({
  intent: z.literal('update-service'),
  serviceAssignmentId: z.coerce.number(),
  serviceName: z.string().min(1),
  allowedRoleIds: roleIdsField.default([]),
})

export const applyTemplateSchema = z.object({
  intent: z.literal('apply-template'),
  templateId: z.coerce.number(),
})
