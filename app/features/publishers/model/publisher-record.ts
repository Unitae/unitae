import { coversMonth, type EnrolmentPeriod } from './pioneer-enrolment'
import { enrolmentModeOf } from './pioneer-enrolment-form'
import type { RecordEnrolment } from './publisher-record.type'

/** The person's enrolments as the record lists them: each as its service, the one covering this month marked. */
export function toRecordEnrolments(
  enrolments: (EnrolmentPeriod & { id: number })[],
  now: { month: number; year: number },
): RecordEnrolment[] {
  return enrolments.map(enrolment => ({
    id: enrolment.id,
    mode: enrolmentModeOf(enrolment),
    startMonth: enrolment.startMonth,
    startYear: enrolment.startYear,
    endMonth: enrolment.endMonth,
    endYear: enrolment.endYear,
    monthlyGoal: enrolment.monthlyGoal,
    current: coversMonth(enrolment, now.month, now.year),
  }))
}

/** A person's age on a day (`YYYY-MM-DD`), from a birth date stored at UTC midnight. */
export function ageOn(birthDate: Date, day: string): number {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number]
  const before =
    month - 1 < birthDate.getUTCMonth() || (month - 1 === birthDate.getUTCMonth() && date < birthDate.getUTCDate())
  return year - birthDate.getUTCFullYear() - (before ? 1 : 0)
}

/** When the record of someone who left is anonymised, unless they come back: `months` after the departure. */
export function anonymisationDate(leftAt: Date, months: number): Date {
  const date = new Date(leftAt)
  date.setUTCMonth(date.getUTCMonth() + months)
  return date
}
