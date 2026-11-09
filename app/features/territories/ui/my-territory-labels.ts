import type { StatusTone } from '@unitae/ui'

import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import type { TerritoryStatus } from '~/features/territories/server/my-territories.server'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { formatEventDate } from '~/shared/utils/event-time'

/** The loan's state on its status icon and on the bar of time gone by. */
export const LOAN_STYLE: Record<TerritoryStatus, { tone: StatusTone; bar: string }> = {
  'on-time': { tone: 'success', bar: 'bg-chart-1' },
  'due-soon': { tone: 'warning', bar: 'bg-warning' },
  overdue: { tone: 'danger', bar: 'bg-danger' },
}

/** « 23 nov. », or « 23 nov. 2025 » for another year; « 23 novembre » in long form. */
export function loanDay(date: Date | string, timeZone: string, form: 'short' | 'long' = 'short', now = new Date()) {
  const year = (d: Date | string) => formatEventDate(d, timeZone, getLocale(), { year: 'numeric' })
  return formatEventDate(date, timeZone, getLocale(), {
    day: 'numeric',
    month: form,
    ...(year(date) === year(now) ? {} : { year: 'numeric' }),
  })
}

/** What the holder has to do and by when: « À rendre le 23 nov. », « En retard depuis le 3 sept. ». */
export function dueLabel(
  status: TerritoryStatus,
  lateDate: Date | string,
  timeZone: string,
  form: 'short' | 'long' = 'short',
): string {
  const date = loanDay(lateDate, timeZone, form)
  return status === 'overdue' ? m.my_territories_overdue_since({ date }) : m.my_territories_due_on({ date })
}

export function territoryKindLabel(type: string): string {
  if (type === TerritoryKindKey.Phone) return m.territories_type_phone_singular()
  if (type === TerritoryKindKey.Commerces) return m.territories_type_commerces()
  if (type === TerritoryKindKey.Hotel) return m.territories_type_hotel_singular()
  if (type === TerritoryKindKey.Univ) return m.territories_type_university_singular()
  return m.territories_type_classical()
}

/** What there is to visit: households, phone numbers, businesses or entrances, by kind of territory. */
export function territoryQuantityLabel(type: string, counts: { homes: number; phones: number; entrances: number }) {
  if (type === TerritoryKindKey.Phone) return m.my_territories_phones_count({ count: counts.phones })
  if (type === TerritoryKindKey.Classical || type === TerritoryKindKey.Univ) {
    return m.my_territories_homes_count({ count: counts.homes })
  }
  if (type === TerritoryKindKey.Commerces) return m.my_territories_commerces_count({ count: counts.entrances })
  return m.my_territories_entrances_count({ count: counts.entrances })
}

export function territoryCountLabel(count: number): string {
  return count > 1 ? m.my_territories_count_other({ count }) : m.my_territories_count_one({ count })
}
