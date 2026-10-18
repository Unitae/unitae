import type { PioneerEnrolment } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { MonthEnrolment } from '../model/month-enrolment.type'
import {
  type EnrolmentPeriod,
  enrolledMonthsInServiceYear,
  enrolmentForMonth,
  resolveEnrolmentGoal,
} from '../model/pioneer-enrolment'
import { toServiceYear } from '../model/pioneer-pace'
import { resolvePioneerGoal } from './pioneer-goals.queries'

// Read side (CQRS-lite) for pioneer enrolments. No mutations here.

// All of a member's stints, oldest first — the edit page shows these and the pace query walks them.
export function getEnrolmentsForMember(
  db: TransactionClient,
  memberId: number,
  congregationId: number,
): Promise<PioneerEnrolment[]> {
  return db.pioneerEnrolment.findMany({
    where: { memberId, congregationId },
    orderBy: [{ startYear: 'asc' }, { startMonth: 'asc' }],
  })
}

// Every stint that intersects the given service year (RLS-scoped to the congregation) — the roster's
// plan source. The coarse DB bound is refined in JS with the exact period ∩ service-year intersection.
export async function getEnrolmentsForServiceYear(
  db: TransactionClient,
  serviceYear: number,
): Promise<PioneerEnrolment[]> {
  const candidates = await db.pioneerEnrolment.findMany({
    where: {
      startYear: { lte: serviceYear + 1 },
      OR: [{ endYear: null }, { endYear: { gte: serviceYear } }],
    },
    orderBy: [{ memberId: 'asc' }, { startYear: 'asc' }, { startMonth: 'asc' }],
  })
  return candidates.filter(e => enrolledMonthsInServiceYear(e, serviceYear).length > 0)
}

// Goal layering (spec §7.3): the per-person enrolment goal wins, else the resolved type rate
// (PioneerGoal override → built-in default).
export async function resolveEnrolmentMonthlyGoal(
  db: TransactionClient,
  enrolment: EnrolmentPeriod,
  serviceYear: number,
): Promise<number> {
  const typeRate = await resolvePioneerGoal(db, serviceYear, enrolment.type)
  return resolveEnrolmentGoal(enrolment, typeRate)
}

// The stint covering one calendar month, with its resolved goal, or null: what an activity report
// for that month records. Deliberately not the standing status (standingTypeFromEnrolments): that
// is one value per member, taken from the ongoing stint only, so a month-bounded auxiliary stint
// leaves it Normal and an ongoing stint starting later would apply to the months before it.
export async function getMonthEnrolment(
  db: TransactionClient,
  memberId: number,
  congregationId: number,
  month: number,
  year: number,
): Promise<MonthEnrolment | null> {
  const enrolment = enrolmentForMonth(await getEnrolmentsForMember(db, memberId, congregationId), month, year)
  if (enrolment == null) return null
  return { type: enrolment.type, goal: await resolveEnrolmentMonthlyGoal(db, enrolment, toServiceYear(month, year)) }
}
