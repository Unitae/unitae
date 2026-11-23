import { z } from 'zod'
import { ScheduleKind } from '~/features/events/model/schedule.type'
import { SCHEDULE_NAME_MAX } from './schedule-name.schema'

/** « Ajouter un planning »: from a schedule template, or empty with a name and a kind (D39). */
export const scheduleAddSchema = z.union([
  z.object({ scheduleTemplateId: z.coerce.number().int().positive() }),
  z.object({
    name: z.string().trim().min(1).max(SCHEDULE_NAME_MAX),
    kind: z.enum([ScheduleKind.Programme, ScheduleKind.Duty]),
  }),
])
