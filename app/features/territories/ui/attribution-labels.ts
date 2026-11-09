import type { StatusTone } from '@unitae/ui'

import type { AttributionState } from '~/features/territories/model/attribution-list'
import * as m from '~/i18n/paraglide/messages'
import { addDays, daysBetween } from '~/shared/utils/calendar-day'
import { shortDay } from '~/shared/utils/format-day'
import { formatPersonName } from '~/shared/utils/format-person-name'

/** The state's shape and colour: only a running loan is good, close or late; nothing running stays neutral. */
export const STATE_TONE: Record<AttributionState, StatusTone> = {
  overdue: 'danger',
  'due-soon': 'warning',
  'on-time': 'success',
  paused: 'neutral',
  orphaned: 'danger',
}

export function stateLabel(state: AttributionState): string {
  const labels: Record<AttributionState, () => string> = {
    overdue: m.attributions_state_overdue,
    'due-soon': m.attributions_state_due_soon,
    'on-time': m.attributions_state_on_time,
    paused: m.attributions_state_paused,
    orphaned: m.attributions_state_orphaned,
  }
  return labels[state]()
}

/** Who holds it: an anonymised publisher shows as a former one, never as an empty name. */
export function holderName(publisher: { firstname: string | null; lastname: string | null; anonymized?: boolean }) {
  if (publisher.anonymized) return m.attributions_former_publisher()
  return formatPersonName(publisher, m.attributions_former_publisher())
}

interface DueInput {
  state: AttributionState
  lateDay: string
  campaign: { name: string; endDay: string } | null
  pausedBy: { name: string } | null
  publisher: { leftDay: string | null }
}

/**
 * What a row says about when the territory comes back: « En retard depuis le 25 août », « À rentrer le 16 nov. · dans
 * 7 jours », « À rentrer à la fin de la campagne, le 29 nov. », « En pause · Novembre », « Sans titulaire · a quitté
 * l'assemblée le 14 oct. ».
 */
export function dueText(row: DueInput, today: string): string {
  if (row.state === 'orphaned') {
    return row.publisher.leftDay != null
      ? m.attributions_orphaned_left({ date: shortDay(row.publisher.leftDay, today) })
      : m.attributions_state_orphaned()
  }
  if (row.state === 'paused') {
    return row.pausedBy != null ? m.attributions_paused_by({ name: row.pausedBy.name }) : m.attributions_state_paused()
  }
  if (row.state === 'overdue') return m.attributions_due_overdue({ date: shortDay(row.lateDay, today) })
  // A campaign that closes its attributions makes them due the day after its last one.
  if (row.campaign != null && addDays(row.campaign.endDay, 1) === row.lateDay) {
    return m.attributions_due_campaign({ date: shortDay(row.campaign.endDay, today) })
  }
  const date = shortDay(row.lateDay, today)
  if (row.state === 'due-soon') {
    const count = daysBetween(today, row.lateDay)
    return count === 1 ? m.attributions_due_tomorrow({ date }) : m.attributions_due_soon({ date, count })
  }
  return m.attributions_due_on({ date })
}

/** « 2 territoires · 1 en retard », to compare publishers before choosing one. */
export function loadFacts(person: { held: number; late: number }): string {
  const held =
    person.held === 0
      ? m.attributions_people_none()
      : person.held === 1
        ? m.attributions_people_held_one()
        : m.attributions_people_held_other({ count: person.held })
  return person.late > 0 ? `${held} · ${m.attributions_people_late({ count: person.late })}` : held
}
