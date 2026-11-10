import { z } from 'zod'
import { isCalendarDay } from '~/shared/utils/calendar-day'

const day = z.string().refine(value => isCalendarDay(value))

export const recurringEventSchema = z.object({
  mode: z.literal('recurring'),
  templateId: z.coerce.number(),
  occurrences: z.coerce.number().min(1).max(52),
  startDate: day.optional(),
})

export const singleEventSchema = z.object({
  mode: z.literal('single'),
  templateId: z.coerce.number(),
  date: day,
})

export const freeformEventSchema = z.object({
  mode: z.literal('freeform'),
  name: z.string().min(1),
  date: z.string().min(1),
  startTime: z.string().default('19:00'),
  endTime: z.string().default('21:00'),
})
