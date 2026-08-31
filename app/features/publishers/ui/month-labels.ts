import * as m from '~/i18n/paraglide/messages'

// Calendar-month labels indexed by the 0-indexed month used throughout the enrolment model.
// Each entry is the Paraglide message *function* — call it at render time so a locale change
// is picked up rather than baked in at module load.
export const MONTH_LABELS = [
  m.activity_month_january,
  m.activity_month_february,
  m.activity_month_march,
  m.activity_month_april,
  m.activity_month_may,
  m.activity_month_june,
  m.activity_month_july,
  m.activity_month_august,
  m.activity_month_september,
  m.activity_month_october,
  m.activity_month_november,
  m.activity_month_december,
]
