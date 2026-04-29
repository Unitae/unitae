import { z } from 'zod'

export const updateEventSchema = z.object({
  intent: z.literal('update-event'),
  name: z.string().min(1),
  date: z.string().min(1),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  kindId: z
    .string()
    .optional()
    .transform(v => (v != null && v !== '' && v !== 'none' ? Number(v) : null))
    .pipe(z.number().nullable()),
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
})

export const deletePartSchema = z.object({
  intent: z.literal('delete-part'),
  partAssignmentId: z.coerce.number(),
})

export const addServiceSchema = z.object({
  intent: z.literal('add-service'),
  serviceName: z.string().min(1),
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
})

export const updateServiceSchema = z.object({
  intent: z.literal('update-service'),
  serviceAssignmentId: z.coerce.number(),
  serviceName: z.string().min(1),
})

export const applyTemplateSchema = z.object({
  intent: z.literal('apply-template'),
  templateId: z.coerce.number(),
})
