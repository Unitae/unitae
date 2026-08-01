import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { PublisherType } from '~/shared/types/publisher-type'

export interface SetPioneerGoalParams {
  serviceYear: number
  type: PublisherType
  monthlyHours: number
  congregationId: number
  actorId: number
}

// Upsert a congregation's per-(service year, type) goal override. Plain CRUD, not an
// aggregate (single writer, no coordinated invariant). RLS scopes the row; congregationId
// is threaded explicitly for defence-in-depth on create.
export async function setPioneerGoal(db: TransactionClient, params: SetPioneerGoalParams) {
  const { serviceYear, type, monthlyHours, congregationId, actorId } = params

  const goal = await db.pioneerGoal.upsert({
    where: { serviceYear_type_congregationId: { serviceYear, type, congregationId } },
    create: { serviceYear, type, monthlyHours, congregationId },
    update: { monthlyHours },
  })

  audit({
    action: AuditAction.PioneerGoalUpdated,
    congregationId,
    actorId,
    entityType: 'PioneerGoal',
    entityId: goal.id,
    metadata: { serviceYear, type, monthlyHours },
  })

  return goal
}
