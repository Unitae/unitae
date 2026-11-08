import type { Privilege } from '~/features/publishers/model/publisher-list-filters'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'

const LABELS: Record<Privilege, { male: () => string; female?: () => string }> = {
  elder: { male: m.publishers_privilege_elder },
  servant: { male: m.publishers_privilege_servant },
  'regular-pioneer': { male: m.publishers_privilege_regular_pioneer, female: m.publishers_privilege_regular_pioneer_f },
  'auxiliary-pioneer': {
    male: m.publishers_privilege_auxiliary_pioneer,
    female: m.publishers_privilege_auxiliary_pioneer_f,
  },
  'special-pioneer': { male: m.publishers_privilege_special_pioneer, female: m.publishers_privilege_special_pioneer_f },
  missionary: { male: m.publishers_privilege_missionary },
}

/** The tag for a privilege; pioneer tags take the feminine form for a sister. */
export function privilegeLabel(privilege: Privilege, isMale: boolean | null): string {
  const label = LABELS[privilege]
  return isMale === false && label.female ? label.female() : label.male()
}

/** The generic label, for the filter. */
export function privilegeFilterLabel(privilege: Privilege): string {
  return LABELS[privilege].male()
}

function yearIn(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en', { timeZone, year: 'numeric' }).format(date)
}

function dayMonth(date: Date, timeZone: string, now: Date): Intl.DateTimeFormatOptions {
  return {
    timeZone,
    day: 'numeric',
    month: 'short',
    ...(yearIn(date, timeZone) === yearIn(now, timeZone) ? {} : { year: 'numeric' }),
  }
}

/** « 5 nov. », with the year when it is not this one, read in the congregation zone. */
export function formatListDate(date: Date | string, timeZone: string, now: Date = new Date()): string {
  const value = new Date(date)
  return new Intl.DateTimeFormat(getLocale(), dayMonth(value, timeZone, now)).format(value)
}

/** « 14 – 21 déc. », or a single day when the absence has no end. */
export function formatAbsence(
  start: Date | string | null,
  end: Date | string | null,
  timeZone: string,
  now: Date = new Date(),
): string {
  if (start == null) return end == null ? '' : formatListDate(end, timeZone, now)
  const from = new Date(start)
  if (end == null) return formatListDate(from, timeZone, now)
  return new Intl.DateTimeFormat(getLocale(), dayMonth(from, timeZone, now)).formatRange(from, new Date(end))
}
