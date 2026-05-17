import { z } from 'zod'

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

export const updateTemplateSchema = z.object({
  intent: z.literal('update-template'),
  name: z.string().min(1),
  weekDay: z
    .string()
    .optional()
    .transform(v => (v != null && v !== '' && v !== 'none' ? Number(v) : null))
    .pipe(z.number().nullable()),
  kindId: z
    .string()
    .optional()
    .transform(v => (v != null && v !== '' && v !== 'none' ? Number(v) : null))
    .pipe(z.number().nullable()),
  startTime: z.string().regex(TIME_REGEX),
  endTime: z.string().regex(TIME_REGEX),
})

const roleIdsField = z.preprocess(
  v => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]),
  z.array(z.coerce.number().int().positive()),
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
  allowedSpeakerRoleIds: roleIdsField.default([]),
  allowedReaderRoleIds: roleIdsField.default([]),
})

export const deletePartSchema = z.object({
  intent: z.literal('delete-part'),
  partId: z.coerce.number(),
})

export const upsertServiceRoleSchema = z.object({
  intent: z.literal('upsert-service-role'),
  roleId: z.coerce.number().optional(),
  roleName: z.string().min(1),
  roleKey: z.string().optional().default(''),
  allowedRoleIds: roleIdsField.default([]),
})

export const deleteServiceRoleSchema = z.object({
  intent: z.literal('delete-service-role'),
  roleId: z.coerce.number(),
})

export const templateResponsibleSchema = z.object({
  userId: z
    .string()
    .optional()
    .transform(v => (v != null && v !== '' && v !== 'none' ? Number(v) : null))
    .pipe(z.number().nullable()),
})

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>
