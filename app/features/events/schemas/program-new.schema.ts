import { z } from 'zod'

export const recurringEventSchema = z.object({
  mode: z.literal('recurring'),
  templateId: z.coerce.number(),
})

export const singleEventSchema = z.object({
  mode: z.literal('single'),
  templateId: z.coerce.number(),
  date: z.string().min(1),
})

export const freeformEventSchema = z.object({
  mode: z.literal('freeform'),
  name: z.string().min(1),
  date: z.string().min(1),
})
