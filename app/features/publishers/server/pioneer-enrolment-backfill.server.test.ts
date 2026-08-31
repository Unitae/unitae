import { describe, expect, it } from 'vitest'

import { PublisherType } from '~/shared/types/publisher-type'
import { type ActivityTypeRow, deriveStintsFromActivity } from './pioneer-enrolment-backfill.server'

// September = month 8 (0-indexed). Service year SY spans Sept(SY)…Aug(SY+1).
function row(id: number, month: number, year: number, type: PublisherType): ActivityTypeRow {
  return { id, month, year, type }
}

const PERM = PublisherType.PionnierPermanant
const AUX = PublisherType.PionnierAuxiliaires
const NORMAL = PublisherType.Normal

describe('deriveStintsFromActivity', () => {
  it('groups a continuing annual pioneer (spanning the Sept boundary) into one ongoing stint', () => {
    // Jun 2025 (SY 2024) … Jan 2026 (SY 2025), member still permanent → ongoing, spans years.
    const rows = [row(1, 5, 2025, PERM), row(2, 8, 2025, PERM), row(3, 0, 2026, PERM)]
    const stints = deriveStintsFromActivity(rows)
    expect(stints).toEqual([
      { type: PERM, startMonth: 5, startYear: 2025, endMonth: null, endYear: null, monthlyGoal: null },
    ])
  })

  it('leaves a mid-year annual start ongoing from its first reported month', () => {
    const stints = deriveStintsFromActivity([row(1, 0, 2026, PERM), row(2, 1, 2026, PERM)])
    expect(stints).toEqual([
      { type: PERM, startMonth: 0, startYear: 2026, endMonth: null, endYear: null, monthlyGoal: null },
    ])
  })

  it('closes a concluded annual run at its last served month (member back to Normal)', () => {
    // Permanent Sept–Nov 2025, then Normal Dec → concluded, stint bounded at Nov.
    const rows = [row(1, 8, 2025, PERM), row(2, 9, 2025, PERM), row(3, 10, 2025, PERM), row(4, 11, 2025, NORMAL)]
    const stints = deriveStintsFromActivity(rows)
    expect(stints).toEqual([
      { type: PERM, startMonth: 8, startYear: 2025, endMonth: 10, endYear: 2025, monthlyGoal: null },
    ])
  })

  it('does not break a run across a no-row gap', () => {
    // Sept, (no Oct), Nov — one continuous ongoing stint.
    const stints = deriveStintsFromActivity([row(1, 8, 2025, PERM), row(2, 10, 2025, PERM)])
    expect(stints).toEqual([
      { type: PERM, startMonth: 8, startYear: 2025, endMonth: null, endYear: null, monthlyGoal: null },
    ])
  })

  it('emits one single-month stint per reported month for a MONTHLY auxiliary (member not permanent aux)', () => {
    // Member type Normal, isolated auxiliary months Oct + Dec (gap Nov) → two single-month stints.
    const stints = deriveStintsFromActivity([row(1, 9, 2025, AUX), row(2, 11, 2025, AUX)])
    expect(stints).toEqual([
      { type: AUX, startMonth: 9, startYear: 2025, endMonth: 9, endYear: 2025, monthlyGoal: null },
      { type: AUX, startMonth: 11, startYear: 2025, endMonth: 11, endYear: 2025, monthlyGoal: null },
    ])
  })

  // A permanent auxiliary is no longer recoverable from activity alone: the snapshots look
  // identical to consecutive monthly sign-ups, and the column that distinguished them is gone.
  // Contiguous auxiliary months therefore backfill as single-month stints, which grants no standing
  // status — the safe direction for a guess.
  it('backfills contiguous auxiliary months as single-month stints, not one ongoing stint', () => {
    const stints = deriveStintsFromActivity([row(1, 8, 2025, AUX), row(2, 9, 2025, AUX)])
    expect(stints).toEqual([
      { type: AUX, startMonth: 8, startYear: 2025, endMonth: 8, endYear: 2025, monthlyGoal: null },
      { type: AUX, startMonth: 9, startYear: 2025, endMonth: 9, endYear: 2025, monthlyGoal: null },
    ])
  })

  it('handles a mid-year type switch: bounded annual stint + monthly auxiliary single-month', () => {
    // Permanent Sept–Oct, then Auxiliary Nov; member type Normal (monthly aux).
    const rows = [row(1, 8, 2025, PERM), row(2, 9, 2025, PERM), row(3, 10, 2025, AUX)]
    const stints = deriveStintsFromActivity(rows)
    expect(stints).toEqual([
      { type: PERM, startMonth: 8, startYear: 2025, endMonth: 9, endYear: 2025, monthlyGoal: null },
      { type: AUX, startMonth: 10, startYear: 2025, endMonth: 10, endYear: 2025, monthlyGoal: null },
    ])
  })

  it('resolves a re-filed month to its latest type before grouping', () => {
    // Oct filed as Normal (id 2) then re-filed as Permanent (id 3, wins). Sept + Oct → one run.
    const rows = [row(1, 8, 2025, PERM), row(2, 9, 2025, NORMAL), row(3, 9, 2025, PERM)]
    const stints = deriveStintsFromActivity(rows)
    expect(stints).toEqual([
      { type: PERM, startMonth: 8, startYear: 2025, endMonth: null, endYear: null, monthlyGoal: null },
    ])
  })

  it('returns no stints when the member never had pioneer activity', () => {
    expect(deriveStintsFromActivity([row(1, 8, 2025, NORMAL)])).toEqual([])
    expect(deriveStintsFromActivity([])).toEqual([])
  })
})
