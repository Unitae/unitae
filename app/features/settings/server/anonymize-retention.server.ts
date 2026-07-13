import { memberAggregate } from '~/features/publishers/index.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import type { MemberId } from '~/shared/types/branded'

const logger = createLogger('anonymize-retention')

/**
 * Returns the ids of Members whose `leftAt` is older than `retentionMonths`
 * ago AND have not yet been anonymized. Callers must have already opened
 * a `withScope` transaction on the target congregation.
 */
export async function findRetentionCandidates(
  db: TransactionClient,
  congregationId: number,
  retentionMonths: number,
  now: Date,
): Promise<number[]> {
  const cutoff = new Date(now.getTime())
  // UTC math avoids DST drift — a September→March window would otherwise
  // slide by an hour depending on the runner's TZ.
  cutoff.setUTCMonth(cutoff.getUTCMonth() - retentionMonths)

  const rows = await db.member.findMany({
    where: {
      congregationId,
      anonymizedAt: null,
      leftAt: { not: null, lte: cutoff },
    },
    select: { id: true },
  })

  return rows.map(r => r.id)
}

/**
 * Runs `memberAggregate.anonymize` for every retention candidate. Skips any
 * candidate whose anonymize throws (e.g. because the member is a group's
 * responsible — the aggregate's Wave 8 guard).
 *
 * `actorId = 0` is the convention for system-driven writes: the audit row
 * carries no human actor and downstream UI can render it as "auto".
 */
export async function autoAnonymizeRetentionCandidates(
  db: TransactionClient,
  congregationId: number,
  actorId: number,
  retentionMonths: number,
  now: Date,
): Promise<{ anonymized: number; skipped: number }> {
  const candidates = await findRetentionCandidates(db, congregationId, retentionMonths, now)

  let anonymized = 0
  let skipped = 0

  for (const memberId of candidates) {
    try {
      await memberAggregate.anonymize(db, memberId as MemberId, congregationId, actorId)
      anonymized++
    } catch (error) {
      logger.warn('Retention anonymize skipped', {
        congregationId,
        memberId,
        reason: error instanceof Error ? error.message : String(error),
      })
      skipped++
    }
  }

  if (anonymized > 0) {
    audit({
      action: AuditAction.RetentionAutoAnonymized,
      congregationId,
      actorId,
      metadata: { anonymized, skipped, retentionMonths },
    })
  }

  return { anonymized, skipped }
}
