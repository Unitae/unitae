import type { PersonSeed } from './people'
import type { TerritorySeed } from './places'
import { ACTIVITY, ATTRIBUTIONS, PEOPLE } from './profile'
import type { Random } from './random'

const DAY = 24 * 60 * 60 * 1000
const YEAR = 365.25 * DAY
/** How long the app rests a door-to-door territory once returned, before it can go out again. */
const REST_DAYS = 90

export type PioneerType = 'PionnierPermanant' | 'PionnierAuxiliaires'
export type ReportType = PioneerType | 'Normal'

/** A month as the app stores it: `month` 0 for January. */
export interface Month {
  month: number
  year: number
}

export interface StintSeed {
  person: number
  type: PioneerType
  start: Month
  end: Month | null
  monthlyGoal: number | null
}

export interface ReportSeed {
  person: number
  month: number
  year: number
  type: ReportType
  hours: number
  studies: number
  isPublisher: boolean
  creditHours: number | null
}

export interface AttributionSeed {
  /** Index in the territory list. */
  territory: number
  person: number
  startDate: Date
  endDate: Date | null
  lateDate: Date
}

const ordinal = (date: Date) => date.getFullYear() * 12 + date.getMonth()
const fromOrdinal = (n: number): Month => ({ month: ((n % 12) + 12) % 12, year: Math.floor(n / 12) })
const toOrdinal = ({ month, year }: Month) => year * 12 + month

function canPioneer(person: PersonSeed, now: Date): boolean {
  const age = person.birthDate ? (now.getTime() - person.birthDate.getTime()) / YEAR : 40
  return person.baptismDate != null && !person.goesInactive && !person.anonymized && age >= 16
}

/**
 * Pioneer service: the regular pioneers serving today (started over the last years), a few who stopped within the
 * history, and auxiliary pioneers month by month — many in spring around the Memorial and in September.
 */
export function generatePioneers(random: Random, people: PersonSeed[], now: Date): StintSeed[] {
  const current = ordinal(now)
  const first = current - ACTIVITY.months
  const active = people.filter(person => person.leftAt == null && canPioneer(person, now))
  const stints: StintSeed[] = []

  // Sisters pioneer about twice as often as brothers here; elders, with their load, a little less.
  const weightOf = (person: PersonSeed) => (person.isMale ? (person.isHelder ? 0.6 : 1) : 2)
  const pickWeighted = (pool: PersonSeed[], count: number) => {
    const chosen: PersonSeed[] = []
    const left = [...pool]
    while (chosen.length < count && left.length > 0) {
      const total = left.reduce((sum, person) => sum + weightOf(person), 0)
      let roll = random.next() * total
      const index = left.findIndex(person => {
        roll -= weightOf(person)
        return roll < 0
      })
      chosen.push(...left.splice(Math.max(0, index), 1))
    }
    return chosen
  }

  const regulars = pickWeighted(active, PEOPLE.regularPioneers)
  for (const person of regulars) {
    const since = Math.max(ordinal(person.createdAt) - 60, current - random.int(3, 150))
    stints.push({
      person: person.key,
      type: 'PionnierPermanant',
      start: fromOrdinal(since),
      end: null,
      monthlyGoal: null,
    })
  }

  const formerPool = people.filter(
    person => !regulars.includes(person) && person.baptismDate != null && !person.goesInactive,
  )
  for (const person of random.shuffle(formerPool).slice(0, ACTIVITY.formerRegularPioneers)) {
    const lastMonth = person.leftAt ? ordinal(person.leftAt) - 1 : current - random.int(2, ACTIVITY.months - 2)
    const end = Math.max(first + 1, lastMonth)
    const start = end - random.int(3, 24)
    stints.push({
      person: person.key,
      type: 'PionnierPermanant',
      start: fromOrdinal(start),
      end: fromOrdinal(end),
      monthlyGoal: null,
    })
  }

  const regularIn = (person: number, month: number) =>
    stints.some(
      stint =>
        stint.person === person &&
        stint.type === 'PionnierPermanant' &&
        toOrdinal(stint.start) <= month &&
        (stint.end == null || toOrdinal(stint.end) >= month),
    )
  const weights = Object.values(ACTIVITY.auxiliaryByMonth)
  const mean = weights.reduce((a, b) => a + b, 0) / weights.length
  for (let month = first; month <= current; month++) {
    // The month under way only has the few who signed up for it already.
    const expected =
      month === current
        ? 3
        : (ACTIVITY.auxiliaryPerMonth * (ACTIVITY.auxiliaryByMonth[fromOrdinal(month).month] ?? mean)) / mean
    const pool = people.filter(
      person =>
        canPioneer(person, now) &&
        ordinal(person.createdAt) <= month &&
        (person.leftAt == null || ordinal(person.leftAt) > month) &&
        !regularIn(person.key, month),
    )
    for (const person of pickWeighted(pool, Math.max(0, Math.round(expected + random.int(-2, 2))))) {
      const goal = random.weighted({ none: 88, 15: 11, 30: 1 })
      stints.push({
        person: person.key,
        type: 'PionnierAuxiliaires',
        start: fromOrdinal(month),
        end: fromOrdinal(month),
        monthlyGoal: goal === 'none' ? null : Number(goal),
      })
    }
  }
  return stints
}

/**
 * Monthly reports from each publisher's arrival to their departure, for the months of the history. Publishers say
 * whether they preached (no hours); pioneers give their hours. A few reports are missing, more for the month just
 * ended. The two who become inactive end with six or more reports without ministry, and `inactiveAt` is the day the
 * sixth came in — what the app does when it is filed.
 */
export function generateReports(
  random: Random,
  people: PersonSeed[],
  stints: StintSeed[],
  now: Date,
): { reports: ReportSeed[]; inactiveAt: Map<number, Date> } {
  const lastEnded = ordinal(now) - 1
  const first = lastEnded - ACTIVITY.months + 1
  const reports: ReportSeed[] = []
  const inactiveAt = new Map<number, Date>()

  for (const person of people) {
    // A pioneer keeps a pace of his own, month after month: the spread is between pioneers, not within one.
    const pace = random.fromPercentiles(ACTIVITY.regularHours)
    const from = Math.max(first, ordinal(person.createdAt))
    const to = person.leftAt ? Math.min(lastEnded, ordinal(person.leftAt) - 1) : lastEnded
    const missedFrom = person.goesInactive ? lastEnded - random.int(6, 9) + 1 : Number.POSITIVE_INFINITY

    for (let month = from; month <= to; month++) {
      const missing = month >= missedFrom
      const rate = month === lastEnded ? ACTIVITY.lastMonthFiledRate : ACTIVITY.filedRate
      if (!missing && !random.chance(rate)) continue
      const { month: m, year } = fromOrdinal(month)
      const stint = stints.find(
        each =>
          each.person === person.key &&
          toOrdinal(each.start) <= month &&
          (each.end == null || toOrdinal(each.end) >= month),
      )
      if (missing) {
        reports.push({
          person: person.key,
          month: m,
          year,
          type: 'Normal',
          hours: 0,
          studies: 0,
          isPublisher: false,
          creditHours: null,
        })
        continue
      }
      if (stint?.type === 'PionnierPermanant') {
        reports.push({
          person: person.key,
          month: m,
          year,
          type: 'PionnierPermanant',
          hours: Math.max(1, pace + random.int(-8, 8)),
          studies: random.chance(ACTIVITY.studiesRate * 2) ? random.int(1, 3) : 0,
          isPublisher: true,
          creditHours: random.chance(ACTIVITY.creditHoursRate)
            ? Math.max(1, random.fromPercentiles(ACTIVITY.creditHours))
            : null,
        })
      } else if (stint?.type === 'PionnierAuxiliaires') {
        reports.push({
          person: person.key,
          month: m,
          year,
          type: 'PionnierAuxiliaires',
          hours: Math.max(1, random.fromPercentiles(ACTIVITY.auxiliaryHours)),
          studies: random.chance(ACTIVITY.studiesRate) ? random.int(1, 2) : 0,
          isPublisher: true,
          creditHours: null,
        })
      } else {
        reports.push({
          person: person.key,
          month: m,
          year,
          type: 'Normal',
          hours: 0,
          studies: random.chance(ACTIVITY.studiesRate / 2) ? 1 : 0,
          isPublisher: !random.chance(ACTIVITY.didNotPreachRate),
          creditHours: null,
        })
      }
    }

    if (person.goesInactive) {
      const sixth = fromOrdinal(missedFrom + 5)
      const filed = new Date(sixth.year, sixth.month + 1, random.int(2, 12), 20)
      inactiveAt.set(person.key, new Date(Math.min(filed.getTime(), now.getTime() - DAY)))
    }
  }
  return { reports, inactiveAt }
}

/**
 * Who had each territory, over the history: a few times per territory, from a few days to several months, never two
 * at once and never during the 90 days it rests once returned; about four in ten are out today, some past their
 * return date. Pioneers take the most.
 */
export function generateAttributions(
  random: Random,
  territories: TerritorySeed[],
  people: PersonSeed[],
  stints: StintSeed[],
  now: Date,
): AttributionSeed[] {
  const oldest = now.getTime() - ATTRIBUTIONS.months * 30 * DAY
  const pioneers = new Set(
    stints.filter(stint => stint.type === 'PionnierPermanant' && stint.end == null).map(stint => stint.person),
  )
  const publishers = people.filter(
    person => person.leftAt == null && !person.goesInactive && person.baptismDate != null,
  )
  const weightOf = (person: PersonSeed) => (pioneers.has(person.key) ? 5 : person.isHelder ? 1.5 : 1)
  const total = publishers.reduce((sum, person) => sum + weightOf(person), 0)
  const assignee = () => {
    let roll = random.next() * total
    for (const person of publishers) {
      roll -= weightOf(person)
      if (roll < 0) return person.key
    }
    return (publishers.at(-1) as PersonSeed).key
  }

  const openCount = Math.round(territories.length * ATTRIBUTIONS.openRate)
  const open = new Set(random.shuffle(territories.map((_, index) => index)).slice(0, openCount))
  const attributions: AttributionSeed[] = []

  territories.forEach((territory, index) => {
    const lateAfter = (territory.type === 'Commerces' ? 180 : 120) * DAY
    let count = random.weighted(ATTRIBUTIONS.perTerritory)
    // Not out today: returned some weeks or months ago, so most are free again and some still resting.
    let cursor = open.has(index) ? now.getTime() : now.getTime() - random.int(5, 300) * DAY
    if (open.has(index)) {
      const start = cursor - Math.max(1, random.fromPercentiles(ATTRIBUTIONS.openAgeDays)) * DAY
      attributions.push({
        territory: index,
        person: assignee(),
        startDate: new Date(start),
        endDate: null,
        lateDate: new Date(start + lateAfter),
      })
      cursor = start - (REST_DAYS + random.int(0, 60)) * DAY
      count--
    }
    for (; count > 0; count--) {
      const end = cursor
      const start = end - Math.max(1, random.fromPercentiles(ATTRIBUTIONS.durationDays)) * DAY
      if (start < oldest) break
      attributions.push({
        territory: index,
        person: assignee(),
        startDate: new Date(start),
        endDate: new Date(end),
        lateDate: new Date(start + lateAfter),
      })
      cursor = start - (REST_DAYS + random.int(0, 120)) * DAY
    }
  })
  return attributions
}
