import type { TransactionClient } from '~/shared/infra/db.server'
import { PublisherType } from '~/shared/types/publisher-type'

import type { EnrolmentPeriod } from '../model/pioneer-enrolment'
import { type EnrolmentActualMonth, planFromEnrolments } from '../model/pioneer-enrolment-pace'
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

interface MemberWithEnrolments extends MemberWithActivities {
  pioneerEnrolments: EnrolmentPeriod[]
}

// The roster summary, driven by explicit PioneerEnrolment stints (§7.4): the plan (which months are
// owed, at what goal) comes from the stints, the actual hours from PublisherActivity.
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
        { pioneerEnrolments: { some: {} } },
      ],
    },
    include: {
      publisherGroup: { select: { name: true } },
      activities: { where: withPriorServiceYearWhere(serviceYear), orderBy: { id: 'desc' } },
      pioneerEnrolments: true,
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

function classifyPioneerMember(
  member: MemberWithEnrolments,
  rates: Map<PublisherType, number>,
  serviceYear: number,
  now: Date,
): PioneerActivity | null {
  const thisYear = member.activities.filter(r => serviceYearOfRow(r.month, r.year) === serviceYear)
  const rows: EnrolmentActualMonth[] = dedupeLatestPerMonth(thisYear)
  const plan = planFromEnrolments(member.pioneerEnrolments, rows, serviceYear, member.type)
  if (plan === null) return null

  const typeRate = rates.get(plan.rosterType)
  if (typeRate === undefined) throw new Error(`No goal rate resolved for pioneer type ${plan.rosterType}`)
  // Per-person goal (auxiliary 15/30) wins; otherwise the resolved type rate.
  const monthlyRate =
    plan.currentMonthlyGoal != null && plan.currentMonthlyGoal > 0 ? plan.currentMonthlyGoal : typeRate

  const base: PioneerRosterRowBase = {
    memberId: member.id,
    firstname: member.firstname,
    lastname: member.lastname,
    type: plan.rosterType,
    groupName: member.publisherGroup?.name ?? null,
    concluded: plan.concluded,
    monthlyRate,
  }

  if (plan.isAuxiliary) {
    // Auxiliary is scored on the PLAN: every enrolled month counts, with its reported hours joined
    // (null when no report is filed yet → "enrolled · report pending"). This is why the auxiliary
    // path uses enrolledMonths rather than only the reported rows.
    const hoursByMonth = new Map(plan.months.map(pm => [pm.month * 10000 + pm.year, pm]))
    const auxMonths: PioneerMonth[] = plan.enrolledMonths.map(mr => {
      const reported = hoursByMonth.get(mr.month * 10000 + mr.year)
      return { month: mr.month, year: mr.year, hours: reported?.hours ?? null, studies: reported?.studies }
    })
    return {
      kind: 'auxiliary',
      row: { ...base, auxiliary: computeAuxiliarySummary({ serviceYear, monthlyRate, months: auxMonths, now }) },
    }
  }
  return {
    kind: 'annual',
    row: {
      ...base,
      pace: computePioneerPace({
        serviceYear,
        monthlyRate,
        months: plan.months,
        now,
        enrolledSinceYearStart: plan.enrolledSinceYearStart,
        concluded: plan.concluded,
        notEnrolledMonths: plan.notEnrolledMonths,
      }),
    },
  }
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
      pioneerEnrolments: true,
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
