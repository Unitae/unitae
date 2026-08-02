import type { TransactionClient } from '~/shared/infra/db.server'
import { PublisherType } from '~/shared/types/publisher-type'

import { isAuxiliaryType, isPioneerType } from '../model/pioneer-goals.constants'
import { computeAuxiliarySummary, computePioneerPace, type PioneerMonth, type PioneerPace } from '../model/pioneer-pace'
import type {
  PioneerActivity,
  PioneerActivitySummary,
  PioneerAnnualRow,
  PioneerAuxiliaryRow,
  PioneerRosterRowBase,
} from '../model/pioneer-roster.type'
import { resolvePioneerGoal } from './pioneer-goals.queries'

const PIONEER_TYPES = [
  PublisherType.PionnierAuxiliaires,
  PublisherType.PionnierPermanant,
  PublisherType.PionnierSpecial,
  PublisherType.Missionnaire,
] as const

const RISK_RANK: Record<PioneerPace['riskBucket'], number> = { red: 0, amber: 1, green: 2 }

interface ActivityRow {
  id: number
  month: number
  year: number
  type: PublisherType
  hours: number | null
  studies: number
}

function absMonth(month: number, year: number): number {
  return year * 12 + month
}

// One row per (month, year), keeping the highest id (the latest re-filed report).
function dedupeLatestPerMonth(activities: ActivityRow[]): ActivityRow[] {
  const byMonth = new Map<number, ActivityRow>()
  for (const row of activities) {
    const key = absMonth(row.month, row.year)
    const existing = byMonth.get(key)
    if (!existing || row.id > existing.id) byMonth.set(key, row)
  }
  return [...byMonth.values()]
}

// The Sept–Aug service year maps to two calendar years; `month` is 0-indexed.
function serviceYearWhere(serviceYear: number) {
  return {
    OR: [
      { year: serviceYear, month: { gte: 8 } },
      { year: serviceYear + 1, month: { lte: 7 } },
    ],
  }
}

// The selected service year plus the one before it — used to tell a *continuing* pioneer
// (enrolled since September) from a genuinely new mid-year appointment.
function withPriorServiceYearWhere(serviceYear: number) {
  return { OR: [...serviceYearWhere(serviceYear - 1).OR, ...serviceYearWhere(serviceYear).OR] }
}

function serviceYearOfRow(month: number, year: number): number {
  return month >= 8 ? year : year - 1
}

export async function getPioneerActivitySummary(
  db: TransactionClient,
  _congregationId: number,
  serviceYear: number,
  now: Date,
): Promise<PioneerActivitySummary> {
  const members = await db.member.findMany({
    where: {
      anonymizedAt: null,
      OR: [
        { type: { not: PublisherType.Normal } },
        { activities: { some: { ...serviceYearWhere(serviceYear), type: { not: PublisherType.Normal } } } },
      ],
    },
    include: {
      publisherGroup: { select: { name: true } },
      activities: { where: withPriorServiceYearWhere(serviceYear), orderBy: { id: 'desc' } },
    },
    orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
  })

  const rates = await resolveRates(db, serviceYear)

  const annual: PioneerAnnualRow[] = []
  const auxiliary: PioneerAuxiliaryRow[] = []

  for (const member of members) {
    const classified = classifyPioneerMember(member, rates, serviceYear, now)
    if (classified?.kind === 'annual') annual.push(classified.row)
    else if (classified?.kind === 'auxiliary') auxiliary.push(classified.row)
  }

  sortMostAtRiskFirst(annual)
  return { serviceYear, annual, auxiliary, totals: computeTotals(annual) }
}

// Pace/section for a single member's detail page. Returns null when the member is not a
// pioneer this service year (nothing to show).
export async function getPioneerActivityForMember(
  db: TransactionClient,
  memberId: number,
  congregationId: number,
  serviceYear: number,
  now: Date,
): Promise<PioneerActivity | null> {
  const member = await db.member.findFirst({
    where: { id: memberId, congregationId },
    include: {
      publisherGroup: { select: { name: true } },
      activities: { where: withPriorServiceYearWhere(serviceYear), orderBy: { id: 'desc' } },
    },
  })
  if (member === null) return null

  const rates = await resolveRates(db, serviceYear)
  return classifyPioneerMember(member, rates, serviceYear, now)
}

interface MemberWithActivities {
  id: number
  firstname: string
  lastname: string
  type: PublisherType
  publisherGroup: { name: string } | null
  activities: ActivityRow[]
}

function classifyPioneerMember(
  member: MemberWithActivities,
  rates: Map<PublisherType, number>,
  serviceYear: number,
  now: Date,
): PioneerActivity | null {
  // `activities` spans two service years; the roster reflects the selected year only.
  const thisYear = member.activities.filter(r => serviceYearOfRow(r.month, r.year) === serviceYear)
  const rows = dedupeLatestPerMonth(thisYear)
  const pioneerRows = rows.filter(r => isPioneerType(r.type))
  if (pioneerRows.length === 0 && !isPioneerType(member.type)) return null

  // A continuing pioneer (any pioneer activity the previous service year) is enrolled from
  // September, so a missing early report does not shrink their goal.
  const enrolledSinceYearStart = member.activities.some(
    r => isPioneerType(r.type) && serviceYearOfRow(r.month, r.year) === serviceYear - 1,
  )

  const latest = mostRecent(rows)
  const standingType = latest?.type ?? member.type
  const concluded = !isPioneerType(standingType)
  const rosterType = isPioneerType(standingType) ? standingType : (mostRecent(pioneerRows)?.type ?? member.type)

  const months: PioneerMonth[] = pioneerRows
    .filter(r => r.type === rosterType)
    .map(r => ({ month: r.month, year: r.year, hours: r.hours, studies: r.studies }))
  const monthlyRate = rates.get(rosterType)
  if (monthlyRate === undefined) throw new Error(`No goal rate resolved for pioneer type ${rosterType}`)

  const base: PioneerRosterRowBase = {
    memberId: member.id,
    firstname: member.firstname,
    lastname: member.lastname,
    type: rosterType,
    groupName: member.publisherGroup?.name ?? null,
    concluded,
    monthlyRate,
  }

  if (isAuxiliaryType(rosterType)) {
    return {
      kind: 'auxiliary',
      row: { ...base, auxiliary: computeAuxiliarySummary({ serviceYear, monthlyRate, months, now }) },
    }
  }
  return {
    kind: 'annual',
    row: {
      ...base,
      pace: computePioneerPace({ serviceYear, monthlyRate, months, now, enrolledSinceYearStart, concluded }),
    },
  }
}

function mostRecent(rows: ActivityRow[]): ActivityRow | null {
  return rows.reduce<ActivityRow | null>(
    (acc, r) => (acc === null || absMonth(r.month, r.year) > absMonth(acc.month, acc.year) ? r : acc),
    null,
  )
}

async function resolveRates(db: TransactionClient, serviceYear: number): Promise<Map<PublisherType, number>> {
  const rates = new Map<PublisherType, number>()
  for (const type of PIONEER_TYPES) {
    rates.set(type, await resolvePioneerGoal(db, serviceYear, type))
  }
  return rates
}

function sortMostAtRiskFirst(annual: PioneerAnnualRow[]): void {
  annual.sort((a, b) => {
    if (a.concluded !== b.concluded) return a.concluded ? 1 : -1
    const rank = RISK_RANK[a.pace.riskBucket] - RISK_RANK[b.pace.riskBucket]
    return rank !== 0 ? rank : a.pace.paceDelta - b.pace.paceDelta
  })
}

function computeTotals(annual: PioneerAnnualRow[]): PioneerActivitySummary['totals'] {
  const totals = { onTrack: 0, behind: 0, atRisk: 0, actualHours: 0, targetHours: 0 }
  for (const row of annual) {
    if (row.concluded) continue
    if (row.pace.riskBucket === 'green') totals.onTrack++
    else if (row.pace.riskBucket === 'amber') totals.behind++
    else totals.atRisk++
    totals.actualHours += row.pace.actualToDate
    totals.targetHours += row.pace.fullYearTarget
  }
  return totals
}
