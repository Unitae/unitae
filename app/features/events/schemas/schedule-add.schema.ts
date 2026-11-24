import { z } from 'zod'
import { ScheduleKind } from '~/features/events/model/schedule.type'
import { SCHEDULE_NAME_MAX } from './schedule-name.schema'

/** « Ajouter un planning » (D39): from a schedule template, or empty with a name and a kind; never both. */
export const scheduleAddSchema = z.union([
  z.strictObject({ scheduleTemplateId: z.coerce.number().int().positive() }),
  z.strictObject({
    name: z.string().trim().min(1).max(SCHEDULE_NAME_MAX),
    kind: z.enum([ScheduleKind.Programme, ScheduleKind.Duty]),
  }),
])
