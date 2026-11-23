import { z } from 'zod'

/** A schedule's name on one event (D44): what the section shows, never empty. */
export const SCHEDULE_NAME_MAX = 80

export const scheduleNameSchema = z.object({
  name: z.string().trim().min(1).max(SCHEDULE_NAME_MAX),
})
