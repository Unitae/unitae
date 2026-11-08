import type { CadenceEntry } from '~/features/events/model/cadence.type'
import * as m from '~/i18n/paraglide/messages'
import type { PersonDescription } from '~/shared/ui/PersonDropdown'

const LOCALE = 'fr-FR'

/** « 22 octobre », « 1er octobre », with the year when it is not the reference one: « 18 août 2025 ». */
function formatDay(date: Date, timeZone: string, withYear: boolean): string {
  const parts = new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    day: 'numeric',
    month: 'long',
    ...(withYear ? { year: 'numeric' } : {}),
  }).formatToParts(date)
  return parts.map(part => (part.type === 'day' && part.value === '1' ? '1er' : part.value)).join('')
}

const yearOf = (date: Date, timeZone: string) =>
  Number(new Intl.DateTimeFormat(LOCALE, { timeZone, year: 'numeric' }).format(date))

/** The day of an event, in the congregation's time zone. */
export function formatFactDate(iso: string, timeZone: string, referenceYear: number): string {
  const date = new Date(iso)
  return formatDay(date, timeZone, yearOf(date, timeZone) !== referenceYear)
}

/**
 * A declared absence: « du 10 au 16 novembre », « du 28 octobre au 3 novembre », « le 12 novembre ». Absences are
 * whole days stored at midnight UTC, so they are read in UTC: any other zone could move them by a day.
 */
export function formatAbsenceRange(startIso: string, endIso: string, referenceYear: number): string {
  const start = new Date(startIso)
  const end = new Date(endIso)
  const startYear = start.getUTCFullYear()
  const endYear = end.getUTCFullYear()
  const endLabel = formatDay(end, 'UTC', endYear !== referenceYear || startYear !== endYear)
  if (start.toISOString().slice(0, 10) === end.toISOString().slice(0, 10)) return m.person_facts_day({ day: endLabel })
  const sameMonth = startYear === endYear && start.getUTCMonth() === end.getUTCMonth()
  const startLabel = sameMonth
    ? start.getUTCDate() === 1
      ? '1er'
      : String(start.getUTCDate())
    : formatDay(start, 'UTC', startYear !== endYear)
  return m.person_facts_range({ start: startLabel, end: endLabel })
}

interface CandidateFacts {
  lastAssignedAt?: string
  absence?: { startDate: string; endDate: string }
  elsewhere?: string[]
}

interface DescribeOptions {
  kind: 'part' | 'service'
  timeZone: string
  referenceYear: number
}

/**
 * One person in the list for a slot. The order is a rule, not an accident of the data: whoever never held the slot
 * comes first, then the longest since their last time; people absent on the date are set aside at the end.
 */
export function describeCandidate(facts: CandidateFacts, { kind, timeZone, referenceYear }: DescribeOptions) {
  if (facts.absence) {
    return {
      facts: `${m.person_facts_absence({ range: formatAbsenceRange(facts.absence.startDate, facts.absence.endDate, referenceYear) })}`,
      tone: 'danger',
      setAside: m.person_facts_absent_group(),
      rank: facts.lastAssignedAt ? Date.parse(facts.lastAssignedAt) : Number.NEGATIVE_INFINITY,
    } satisfies PersonDescription
  }
  const history = facts.lastAssignedAt
    ? m.person_facts_list_last({ date: formatFactDate(facts.lastAssignedAt, timeZone, referenceYear) })
    : kind === 'service'
      ? m.person_facts_list_never_service()
      : m.person_facts_list_never_part()
  const busy = facts.elsewhere != null && facts.elsewhere.length > 0
  return {
    facts: busy ? `${m.person_facts_list_elsewhere()} · ${history}` : history,
    tone: busy ? 'warning' : undefined,
    rank: facts.lastAssignedAt ? Date.parse(facts.lastAssignedAt) : Number.NEGATIVE_INFINITY,
  } satisfies PersonDescription
}

interface RotationInput {
  past: CadenceEntry[]
  future: CadenceEntry[]
  lastAssignedAt: string | null
}

/**
 * The sentence beside « Sur cette partie »: « jamais », « pas depuis le 18 août 2025 », « 1 des 6 dernières fois ·
 * la dernière le 22 octobre ». The count uses the real number of past occurrences shown, and drops out when the
 * rotation warning already says it.
 */
export function rotationSentence(
  { past, future, lastAssignedAt }: RotationInput,
  { countWarned, timeZone, referenceYear }: { countWarned: boolean; timeZone: string; referenceYear: number },
): string {
  const nextTime = future.find(entry => entry.assigned)
  const planned = nextTime
    ? m.person_facts_planned({ date: formatFactDate(nextTime.date, timeZone, referenceYear) })
    : null
  const join = (...pieces: (string | null)[]) => pieces.filter(Boolean).join(' · ')

  if (lastAssignedAt == null) return join(planned ? null : m.person_facts_never(), planned)
  const last = formatFactDate(lastAssignedAt, timeZone, referenceYear)
  const times = past.filter(entry => entry.assigned).length
  if (times === 0) return join(m.person_facts_not_since({ date: last }), planned)
  if (countWarned) return join(m.person_facts_last({ date: last }), planned)
  return join(
    m.person_facts_count({ count: String(times), total: String(past.length) }),
    m.person_facts_last({ date: last }),
    planned,
  )
}
