import { z } from 'zod'

const roleIdsField = z.preprocess(
  v => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]),
  z.array(z.coerce.number().int().positive()),
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
  allowedSpeakerRoleIds: roleIdsField.default([]),
  allowedReaderRoleIds: roleIdsField.default([]),
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
  allowedSpeakerRoleIds: roleIdsField.default([]),
  allowedReaderRoleIds: roleIdsField.default([]),
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
