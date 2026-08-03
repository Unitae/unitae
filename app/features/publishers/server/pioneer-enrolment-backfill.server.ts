import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import { PublisherType } from '~/shared/types/publisher-type'
import { isAuxiliaryType, isPioneerType } from '../model/pioneer-goals.constants'
import { openEnrolment } from './pioneer-enrolment.aggregate'

const logger = createLogger('pioneer-enrolment-backfill')

// One-time backfill: turn the historical per-month `PublisherActivity.type` snapshots into explicit
// `PioneerEnrolment` stints. This is the inference logic (stop/restart + concluded) run once, per
// member, over their WHOLE activity history — see spec §6.1. It is idempotent (skips members who
// already have enrolments) and writes every stint through the aggregate's `openEnrolment`.

export interface ActivityTypeRow {
  id: number
  month: number
  year: number
  type: PublisherType
}

interface StintDraft {
  type: PublisherType
  startMonth: number
  startYear: number
  endMonth: number | null
  endYear: number | null
  monthlyGoal: null
}

function absMonth(month: number, year: number): number {
  return year * 12 + month
}

// One row per (month, year), latest id wins (a re-filed month resolves to its final type).
function dedupeLatestPerMonth(rows: ActivityTypeRow[]): ActivityTypeRow[] {
  const byMonth = new Map<number, ActivityTypeRow>()
  for (const r of rows) {
    const key = absMonth(r.month, r.year)
    const existing = byMonth.get(key)
    if (!existing || r.id > existing.id) byMonth.set(key, r)
  }
  return [...byMonth.values()].sort((a, b) => absMonth(a.month, a.year) - absMonth(b.month, b.year))
}

interface Run {
  type: PublisherType
  rows: ActivityTypeRow[]
}

// Maximal runs of the same type over the sorted deduped rows. A no-row gap does NOT break a run
// (the deduped list simply skips absent months); only a different type does.
function groupRuns(deduped: ActivityTypeRow[]): Run[] {
  const runs: Run[] = []
  for (const r of deduped) {
    const current = runs.at(-1)
    if (current && current.type === r.type) current.rows.push(r)
    else runs.push({ type: r.type, rows: [r] })
  }
  return runs
}

function annualStint(run: Run, ongoing: boolean): StintDraft {
  const first = run.rows[0]
  const last = run.rows.at(-1) as ActivityTypeRow
  return {
    type: run.type,
    startMonth: first.month,
    startYear: first.year,
    endMonth: ongoing ? null : last.month,
    endYear: ongoing ? null : last.year,
    monthlyGoal: null,
  }
}

function singleMonthStint(r: ActivityTypeRow): StintDraft {
  return { type: r.type, startMonth: r.month, startYear: r.year, endMonth: r.month, endYear: r.year, monthlyGoal: null }
}

// Pure derivation (spec §6.1). `memberType` is the member's standing type — it distinguishes a
// permanent auxiliary (grouped like an annual stint) from a monthly auxiliary (one single-month
// stint per reported month).
export function deriveStintsFromActivity(rows: ActivityTypeRow[], memberType: PublisherType): StintDraft[] {
  const deduped = dedupeLatestPerMonth(rows)

  // Concluded here decides whether the member's FINAL run gets a close date: true when their latest
  // snapshot is no longer a pioneer. This is the backfill's close-the-stint rule — distinct from the
  // pace query's per-service-year "concluded" (pioneer-enrolment-pace.ts), which asks whether the
  // member is finished pioneering *this year*. The parity test (§14) checks the two produce matching
  // pace, not that the intermediate `concluded` values are identical.
  const standingType = deduped.at(-1)?.type ?? memberType
  const concluded = !isPioneerType(standingType)
  const isPermanentAux = memberType === PublisherType.PionnierAuxiliaires

  const runs = groupRuns(deduped)
  const lastRunIndex = runs.length - 1

  const stints: StintDraft[] = []
  runs.forEach((run, index) => {
    if (!isPioneerType(run.type)) return // a Normal run is a gap, not a stint

    if (isAuxiliaryType(run.type) && !isPermanentAux) {
      // Monthly auxiliary: never grouped — one single-month stint per reported month.
      for (const r of run.rows) stints.push(singleMonthStint(r))
      return
    }

    // Annual type OR permanent auxiliary: one stint per run. Only the member's final run stays
    // ongoing (and only when not concluded); every earlier run is bounded at its last served month.
    const ongoing = index === lastRunIndex && !concluded
    stints.push(annualStint(run, ongoing))
  })

  return stints
}

interface BackfillMember {
  id: number
  type: PublisherType
}

// Persist one member's derived stints via the aggregate. Idempotent: a member who already has any
// enrolment is skipped (a re-run is a no-op). Returns the number of stints written.
export async function backfillMemberEnrolments(
  db: TransactionClient,
  member: BackfillMember,
  congregationId: number,
  actorId: number,
): Promise<number> {
  const existing = await db.pioneerEnrolment.count({ where: { memberId: member.id, congregationId } })
  if (existing > 0) return 0

  const activity = await db.publisherActivity.findMany({
    where: { publisherId: member.id, congregationId },
    select: { id: true, month: true, year: true, type: true },
  })

  const stints = deriveStintsFromActivity(activity, member.type)
  for (const stint of stints) {
    await openEnrolment(db, member.id, congregationId, actorId, {
      type: stint.type,
      startMonth: stint.startMonth,
      startYear: stint.startYear,
      ...(stint.endMonth != null && stint.endYear != null ? { endMonth: stint.endMonth, endYear: stint.endYear } : {}),
    })
  }
  return stints.length
}

// Backfill every member of a congregation. Caller supplies an RLS-scoped tx.
export async function backfillCongregationEnrolments(
  db: TransactionClient,
  congregationId: number,
  actorId: number,
): Promise<{ members: number; stints: number }> {
  const members = await db.member.findMany({
    where: { congregationId },
    select: { id: true, type: true },
  })
  let stints = 0
  for (const member of members) {
    try {
      stints += await backfillMemberEnrolments(db, member, congregationId, actorId)
    } catch (error) {
      // A stint failing (e.g. a genuine DB error) aborts the whole backfill so the caller's import
      // transaction rolls back — but name the member first, otherwise the failure is undiagnosable.
      logger.error(`Backfill failed for member ${member.id}`, { congregationId, memberId: member.id, error })
      throw error
    }
  }
  return { members: members.length, stints }
}
