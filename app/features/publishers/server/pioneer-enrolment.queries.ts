import type { PioneerEnrolment } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import { type EnrolmentPeriod, enrolledMonthsInServiceYear, resolveEnrolmentGoal } from '../model/pioneer-enrolment'
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
