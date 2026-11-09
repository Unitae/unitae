import type { EnrolmentMode } from '~/features/publishers/model/pioneer-enrolment-form'
import type { RecordEnrolment } from '~/features/publishers/model/publisher-record.type'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'

const SERVICE: Record<EnrolmentMode, () => string> = {
  'monthly-aux': m.publishers_form_profile_auxiliary_pioneer,
  'permanent-aux': m.publishers_enrolment_standing_permanent_auxiliary,
  permanent: m.publishers_form_profile_permanent_pioneer,
  special: m.publishers_form_profile_special_pioneer,
  missionary: m.publishers_form_profile_missionary,
}

/** The service an enrolment records, in words: « Pionnier permanent ». */
export function serviceLabel(mode: EnrolmentMode): string {
  return SERVICE[mode]()
}

/** A calendar month in the reader's language: « août 2024 ». */
export function monthLabel(month: number, year: number): string {
  return new Intl.DateTimeFormat(getLocale(), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    Date.UTC(year, month, 1),
  )
}

/** A calendar month, short, for a tight control: « nov. 2026 ». */
export function shortMonthLabel(month: number, year: number): string {
  return new Intl.DateTimeFormat(getLocale(), { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    Date.UTC(year, month, 1),
  )
}

/** A month's name alone, in the reader's language: « août ». */
export function monthName(month: number): string {
  return new Intl.DateTimeFormat(getLocale(), { month: 'long', timeZone: 'UTC' }).format(Date.UTC(2000, month, 1))
}

/** When the stint runs: « depuis septembre 2024 », « mars 2024 », « septembre 2023 – juin 2024 ». */
export function periodLabel(enrolment: RecordEnrolment): string {
  const start = monthLabel(enrolment.startMonth, enrolment.startYear)
  if (enrolment.endMonth == null || enrolment.endYear == null)
    return m.publishers_record_enrolment_since({ month: start })
  if (enrolment.endMonth === enrolment.startMonth && enrolment.endYear === enrolment.startYear) return start
  return m.publishers_enrolment_period_range({ from: start, to: monthLabel(enrolment.endMonth, enrolment.endYear) })
}

/** Its goal: the person's own, or the congregation's. */
export function goalLabel(enrolment: RecordEnrolment): string {
  return enrolment.monthlyGoal != null
    ? m.publishers_enrolment_goal_suffix({ goal: String(enrolment.monthlyGoal) })
    : m.publishers_record_enrolment_goal_congregation()
}
