import { z } from 'zod'

export const createTemplateSchema = z.object({
  name: z.string().min(1),
  key: z.string().min(1),
  weekDay: z
    .string()
    .optional()
    .transform(v => (v != null && v !== '' && v !== 'none' ? Number(v) : null))
    .pipe(z.number().nullable()),
})

export const updateTemplateSchema = z.object({
  intent: z.literal('update-template'),
  name: z.string().min(1),
  weekDay: z
    .string()
    .optional()
    .transform(v => (v != null && v !== '' && v !== 'none' ? Number(v) : null))
    .pipe(z.number().nullable()),
})

export const upsertPartSchema = z.object({
  intent: z.literal('upsert-part'),
  partId: z.coerce.number().optional(),
  partName: z.string().min(1),
  partSection: z.string().optional().default(''),
  partTrack: z.string().optional().default(''),
  partOrder: z.coerce.number().default(0),
  partDuration: z.coerce.number().optional(),
  partAllowExternalSpeaker: z
    .string()
    .optional()
    .transform(v => v === 'on'),
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
