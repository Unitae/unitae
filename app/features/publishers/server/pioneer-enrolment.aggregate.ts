import type { PioneerEnrolment } from '~/database/generated/client'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { ConflictError, NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { PublisherType } from '~/shared/types/publisher-type'

// Aggregate for PioneerEnrolment (the plan half of the plan/actual pioneer split). Owns the two
// STRUCTURAL invariants a schema can't express: no two of a member's stints share a month
// (_assertNoOverlap), and end bounds are null together or set together (_assertEndBoundsPaired).
// Field shape (pioneer-type-only, goal > 0, end ≥ start) is validated at the Zod boundary.

interface MonthRange {
  startMonth: number
  startYear: number
  endMonth: number | null
  endYear: number | null
}

function absMonth(month: number, year: number): number {
  return year * 12 + month
}

// An ongoing stint (null end) extends to +∞. Two inclusive month ranges overlap iff each starts
// on or before the other ends — endpoint-inclusive, so two stints sharing a single month count
// as overlapping (a stop-and-restart must leave a clean month gap). Pure — exported for testing;
// the DB-side check in _assertNoOverlap uses the same semantics.
export function enrolmentsOverlap(a: MonthRange, b: MonthRange): boolean {
  const aStart = absMonth(a.startMonth, a.startYear)
  const bStart = absMonth(b.startMonth, b.startYear)
  const aEnd = a.endMonth != null && a.endYear != null ? absMonth(a.endMonth, a.endYear) : Number.POSITIVE_INFINITY
  const bEnd = b.endMonth != null && b.endYear != null ? absMonth(b.endMonth, b.endYear) : Number.POSITIVE_INFINITY
  return aStart <= bEnd && bStart <= aEnd
}

// End bounds must be null together (ongoing) or set together (closed). Pure — exported for testing.
export function endBoundsArePaired(endMonth: number | null, endYear: number | null): boolean {
  return (endMonth === null) === (endYear === null)
}

function _assertEndBoundsPaired(endMonth: number | null, endYear: number | null): void {
  if (!endBoundsArePaired(endMonth, endYear)) {
    throw new ConflictError('pioneer_enrolment_end_bounds_unpaired')
  }
}

async function _assertNoOverlap(
  db: TransactionClient,
  memberId: number,
  congregationId: number,
  candidate: MonthRange,
  excludeId?: number,
): Promise<void> {
  const existing = await db.pioneerEnrolment.findMany({
    where: {
      memberId,
      congregationId,
      ...(excludeId != null ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, startMonth: true, startYear: true, endMonth: true, endYear: true },
  })
  if (existing.some(stint => enrolmentsOverlap(candidate, stint))) {
    throw new ConflictError('pioneer_enrolment_overlap')
  }
}

export interface OpenEnrolmentParams {
  type: PublisherType
  startMonth: number
  startYear: number
  endMonth?: number
  endYear?: number
  monthlyGoal?: number
}

export async function openEnrolment(
  db: TransactionClient,
  memberId: number,
  congregationId: number,
  actorId: number,
  params: OpenEnrolmentParams,
): Promise<PioneerEnrolment> {
  const endMonth = params.endMonth ?? null
  const endYear = params.endYear ?? null
  _assertEndBoundsPaired(endMonth, endYear)
  await _assertNoOverlap(db, memberId, congregationId, {
    startMonth: params.startMonth,
    startYear: params.startYear,
    endMonth,
    endYear,
  })

  const enrolment = await db.pioneerEnrolment.create({
    data: {
      memberId,
      congregationId,
      type: params.type,
      startMonth: params.startMonth,
      startYear: params.startYear,
      endMonth,
      endYear,
      monthlyGoal: params.monthlyGoal ?? null,
    },
  })

  audit({
    action: AuditAction.PioneerEnrolled,
    congregationId,
    actorId,
    entityType: 'PioneerEnrolment',
    entityId: enrolment.id,
    metadata: { memberId, type: params.type },
  })

  return enrolment
}

export async function closeEnrolment(
  db: TransactionClient,
  id: number,
  congregationId: number,
  actorId: number,
  end: { endMonth: number; endYear: number },
): Promise<PioneerEnrolment> {
  const existing = await db.pioneerEnrolment.findFirst({
    where: { id, congregationId },
    select: { id: true, startMonth: true, startYear: true },
  })
  if (!existing) throw new NotFoundError('PioneerEnrolment')
  if (absMonth(end.endMonth, end.endYear) < absMonth(existing.startMonth, existing.startYear)) {
    throw new ConflictError('pioneer_enrolment_end_before_start')
  }

  const enrolment = await db.pioneerEnrolment.update({
    // biome-ignore lint/style/useNamingConvention: Prisma compound-key naming
    where: { id_congregationId: { id, congregationId } },
    data: { endMonth: end.endMonth, endYear: end.endYear },
  })

  audit({
    action: AuditAction.PioneerEnrolmentEnded,
    congregationId,
    actorId,
    entityType: 'PioneerEnrolment',
    entityId: id,
  })

  return enrolment
}

export interface UpdateEnrolmentParams {
  startMonth: number
  startYear: number
  endMonth?: number
  endYear?: number
  monthlyGoal?: number
}

export async function updateEnrolment(
  db: TransactionClient,
  id: number,
  congregationId: number,
  actorId: number,
  params: UpdateEnrolmentParams,
): Promise<PioneerEnrolment> {
  const existing = await db.pioneerEnrolment.findFirst({ where: { id, congregationId }, select: { memberId: true } })
  if (!existing) throw new NotFoundError('PioneerEnrolment')

  const endMonth = params.endMonth ?? null
  const endYear = params.endYear ?? null
  _assertEndBoundsPaired(endMonth, endYear)
  // memberId is fixed by the row — overlap is only ever checked within the same member's stints.
  await _assertNoOverlap(
    db,
    existing.memberId,
    congregationId,
    { startMonth: params.startMonth, startYear: params.startYear, endMonth, endYear },
    id,
  )

  const enrolment = await db.pioneerEnrolment.update({
    // biome-ignore lint/style/useNamingConvention: Prisma compound-key naming
    where: { id_congregationId: { id, congregationId } },
    data: {
      startMonth: params.startMonth,
      startYear: params.startYear,
      endMonth,
      endYear,
      monthlyGoal: params.monthlyGoal ?? null,
    },
  })

  audit({
    action: AuditAction.PioneerEnrolmentUpdated,
    congregationId,
    actorId,
    entityType: 'PioneerEnrolment',
    entityId: id,
  })

  return enrolment
}

export async function deleteEnrolment(
  db: TransactionClient,
  id: number,
  congregationId: number,
  actorId: number,
): Promise<PioneerEnrolment> {
  const enrolment = await db.pioneerEnrolment.delete({
    // biome-ignore lint/style/useNamingConvention: Prisma compound-key naming
    where: { id_congregationId: { id, congregationId } },
  })

  audit({
    action: AuditAction.PioneerEnrolmentDeleted,
    congregationId,
    actorId,
    entityType: 'PioneerEnrolment',
    entityId: id,
  })

  return enrolment
}
