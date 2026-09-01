import { z } from 'zod'
import { MANAGED_ROLE_SLOTS_FIELD } from '~/features/events'
import { NO_RESPONSIBLE_VALUE } from '~/features/settings/ui/ResponsibleRoleField'

const TIME_REGEX = /^\d{2}:\d{2}$/

export const createTemplateSchema = z.object({
  name: z.string().min(1),
  key: z.string().min(1),
  weekDay: z
    .string()
    .optional()
    .transform(v => (v != null && v !== '' && v !== 'none' ? Number(v) : null))
    .pipe(z.number().nullable()),
  startTime: z.string().regex(TIME_REGEX).default('19:00'),
  endTime: z.string().regex(TIME_REGEX).default('21:00'),
})

// System templates (day-off, freeform) render a read-only info card whose
// only editable field is the colour swatch; the form only submits intent +
// color. Requiring name / start / end here would 400 that submission and
// silently drop the colour save. The service layer treats undefined as
// "no change" and enforces the system-template stripping.
export const updateTemplateSchema = z.object({
  intent: z.literal('update-template'),
  name: z.string().min(1).optional(),
  weekDay: z
    .string()
    .optional()
    .transform(v => (v == null || v === '' ? undefined : v === 'none' ? null : Number(v)))
    .pipe(z.number().nullable().optional()),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  startTime: z.string().regex(TIME_REGEX).optional(),
  endTime: z.string().regex(TIME_REGEX).optional(),
})

const roleIdsField = z.preprocess(
  v => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]),
  z.array(z.coerce.number().int().positive()),
)

// Which role pickers the part sheet drew — same rules as the program-edit
// equivalent, and the shared field name is imported rather than retyped so the
// two cannot drift. See partAllowedRolesToWrite.
const managedRoleSlotsField = z.preprocess(
  v => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]),
  z.array(z.string()),
)

// Same rules as the program-edit.schema equivalent — kept local to avoid a
// cross-feature import from settings to events. Change both together.
const partRoleLabelField = z
  .string()
  .trim()
  .max(50)
  .optional()
  .transform(v => (v == null || v === '' ? undefined : v))

// Same rules as the program-edit.schema equivalent — kept local for the same
// reason as the label field above. Change both together.
// Radix's Select forbids an empty-string item value, so the "no kind" option
// carries this sentinel instead. It means exactly what '' and an absent field
// mean: no preset.
export const NO_PRESET_VALUE = 'none'

const partPresetField = z.preprocess(
  v => (v == null || v === '' || v === NO_PRESET_VALUE ? null : v),
  z.coerce.number().int().positive().nullable(),
)

export const upsertPartSchema = z.object({
  intent: z.literal('upsert-part'),
  partId: z.coerce.number().optional(),
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
  partId: z.coerce.number(),
})

export const upsertServicePartSchema = z.object({
  intent: z.literal('upsert-service-role'),
  roleId: z.coerce.number().optional(),
  roleName: z.string().min(1),
  roleKey: z.string().optional().default(''),
  allowedRoleIds: roleIdsField.default([]),
})

export const deleteServicePartSchema = z.object({
  intent: z.literal('delete-service-role'),
  roleId: z.coerce.number(),
})

// The two pickers submit together, and an absent or sentinel value means
// "nobody" for that scope rather than "leave it alone" — the form always
// renders both, so a missing field is a cleared field.
const responsibleRoleField = z
  .string()
  .optional()
  .transform(v => (v != null && v !== '' && v !== NO_RESPONSIBLE_VALUE ? Number(v) : null))
  .pipe(z.number().nullable())

export const templateResponsibleSchema = z.object({
  roleId: responsibleRoleField,
  serviceRoleId: responsibleRoleField,
})

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>
