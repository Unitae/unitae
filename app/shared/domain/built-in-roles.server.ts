import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export const BUILT_IN_ROLE_KEYS = [
  'member',
  'ministry-school-student',
  'publisher',
  'baptized',
  'brother',
  'sister',
  'anointed',
  'elder',
  'assistant-servant',
  'pioneer',
] as const

export type BuiltInRoleKey = (typeof BUILT_IN_ROLE_KEYS)[number]

interface MemberFlags {
  isMale: boolean | null
  isPublisher: boolean
  type: string
  baptismDate: Date | null
  isAnointed: boolean
  isHelder: boolean
  isServant: boolean
  leftAt: Date | null
}

// Built-in roles describe identity within the congregation. They are auto-synced
// from `Member` flags. A Member who has left (`leftAt != null`) holds no
// identity roles regardless of flags — leaving the congregation drops them all.
export const BUILT_IN_ROLE_PREDICATES: Record<BuiltInRoleKey, (m: MemberFlags) => boolean> = {
  member: m => m.leftAt == null,
  'ministry-school-student': m => m.leftAt == null && !m.isPublisher,
  publisher: m => m.leftAt == null && m.isPublisher,
  baptized: m => m.leftAt == null && m.isPublisher && m.baptismDate != null,
  brother: m => m.leftAt == null && m.baptismDate != null && m.isMale === true,
  sister: m => m.leftAt == null && m.baptismDate != null && m.isMale === false,
  anointed: m => m.leftAt == null && m.isPublisher && m.baptismDate != null && m.isAnointed,
  elder: m => m.leftAt == null && m.baptismDate != null && m.isMale === true && m.isHelder,
  'assistant-servant': m => m.leftAt == null && m.baptismDate != null && m.isMale === true && m.isServant,
  pioneer: m =>
    m.leftAt == null &&
    m.isPublisher &&
    m.baptismDate != null &&
    (m.type === 'pionnier-permanant' || m.type === 'pionnier-auxiliaires'),
}

function diffBuiltInAssignments(
  builtInRoles: Array<{ id: number; key: string }>,
  existingRoleIds: Set<number>,
  member: MemberFlags,
): { added: number[]; removed: number[] } {
  const added: number[] = []
  const removed: number[] = []
  for (const role of builtInRoles) {
    const predicate = BUILT_IN_ROLE_PREDICATES[role.key as BuiltInRoleKey]
    const isDesired = predicate?.(member) ?? false
    const isAssigned = existingRoleIds.has(role.id)
    if (isDesired && !isAssigned) added.push(role.id)
    else if (!isDesired && isAssigned) removed.push(role.id)
  }
  return { added, removed }
}

/**
 * Sync built-in identity roles for a Member. Reads the Member's current flags
 * and reconciles `MemberRoleAssignment` rows so that exactly the roles whose
 * predicates are satisfied are assigned.
 *
 * When the Member has `leftAt != null`, every predicate evaluates to false →
 * all built-in role assignments are dropped. Call again after `leftAt` is
 * cleared (return) to re-attach roles based on the still-intact flags.
 */
export async function syncBuiltInRoleAssignments(
  db: TransactionClient,
  memberId: number,
  congregationId: number,
  actorId: number | null,
): Promise<void> {
  const member = await db.member.findUnique({
    where: { id: memberId },
    select: {
      isMale: true,
      isPublisher: true,
      type: true,
      baptismDate: true,
      isAnointed: true,
      isHelder: true,
      isServant: true,
      leftAt: true,
    },
  })
  if (!member) return

  // Scope by congregationId explicitly. Under RLS-scoped callers this is a
  // no-op (rows are already filtered), but callers that bypass RLS — e.g. the
  // seed scripts running as the DB owner — would otherwise match every
  // congregation's built-in roles and write cross-tenant assignments.
  const builtInRoles = await db.role.findMany({
    where: { isBuiltIn: true, congregationId },
    select: { id: true, key: true },
  })

  const existingAssignments = await db.memberRoleAssignment.findMany({
    where: { memberId },
    select: { roleId: true },
  })
  const existingRoleIds = new Set(existingAssignments.map(a => a.roleId))

  const { added, removed } = diffBuiltInAssignments(builtInRoles, existingRoleIds, member)

  if (added.length === 0 && removed.length === 0) return

  if (added.length > 0) {
    await db.memberRoleAssignment.createMany({
      data: added.map(roleId => ({ memberId, roleId, congregationId })),
    })
  }

  if (removed.length > 0) {
    await db.memberRoleAssignment.deleteMany({
      where: { memberId, roleId: { in: removed } },
    })
  }

  const keyById = new Map(builtInRoles.map(r => [r.id, r.key]))
  audit({
    action: AuditAction.RoleAssignmentsSynced,
    congregationId,
    actorId: actorId ?? undefined,
    entityType: 'Member',
    entityId: memberId,
    metadata: {
      added: added.map(id => keyById.get(id)).filter(Boolean),
      removed: removed.map(id => keyById.get(id)).filter(Boolean),
    },
  })
}
