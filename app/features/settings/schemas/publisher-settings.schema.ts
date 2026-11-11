import { z } from 'zod'
import { CongregationSettingKey } from '~/shared/types/congregation-setting-key'
import { PublisherType } from '~/shared/types/publisher-type'

/** The goal fields of a service year, one per pioneer type: `permanent_2026` holds the regular pioneers' 2026 goal. */
export const GOAL_FIELDS = [
  { field: 'permanent', type: PublisherType.PionnierPermanant },
  { field: 'auxiliary', type: PublisherType.PionnierAuxiliaires },
  { field: 'special', type: PublisherType.PionnierSpecial },
  { field: 'missionary', type: PublisherType.Missionnaire },
] as const

export const goalFieldName = (field: string, serviceYear: number) => `${field}_${serviceYear}`

// At least 1 h: a goal of 0 h means nothing, and a blank field coerces to 0. 999 is a loose cap (defaults top out at 100).
const hours = z.coerce.number().int().min(1).max(999)

/**
 * The Proclamateurs form: the goals of the service years shown (only for whoever may set them), and the continuous
 * auxiliary enrolment (only for whoever configures the congregation). Each part is optional so a viewer with one right
 * submits only its part.
 */
export function publisherSettingsSchema(serviceYears: number[]) {
  const goals = Object.fromEntries(
    serviceYears.flatMap(year => GOAL_FIELDS.map(({ field }) => [goalFieldName(field, year), hours.optional()])),
  )
  return z.object({
    ...goals,
    [CongregationSettingKey.PermanentAuxiliaryPioneerProfileActivated]: z
      .string()
      .optional()
      .transform(value => value === 'on' || value === 'true'),
  })
}
