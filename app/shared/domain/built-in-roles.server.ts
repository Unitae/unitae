import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export const BUILT_IN_ROLE_KEYS = [
  'male',
  'female',
  'publisher',
  'baptized',
  'anointed',
  'elder',
  'assistant-servant',
] as const

export type BuiltInRoleKey = (typeof BUILT_IN_ROLE_KEYS)[number]

interface BooleanFields {
  isMale: boolean | null
  isPublisher: boolean
  baptismDate: Date | null
  isAnointed: boolean
  isHelder: boolean
  isServant: boolean
}

// Built-in roles model congregation-domain identities (elder, sister, baptized, …).
// Anyone who isn't an active publisher cannot occupy these domain roles, so every
// predicate but `publisher` itself gates on `isPublisher` first. This keeps non-
// publisher accounts (e.g. dedicated admin/validator users) out of the role matrix.
export const BUILT_IN_ROLE_PREDICATES: Record<BuiltInRoleKey, (u: BooleanFields) => boolean> = {
  male: u => u.isPublisher && u.isMale === true,
  female: u => u.isPublisher && u.isMale === false,
  publisher: u => u.isPublisher,
  baptized: u => u.isPublisher && u.baptismDate != null,
  anointed: u => u.isPublisher && u.isAnointed,
  elder: u => u.isPublisher && u.isHelder,
  'assistant-servant': u => u.isPublisher && u.isServant,
}

function diffBuiltInAssignments(
  builtInRoles: Array<{ id: number; key: string }>,
  existingRoleIds: Set<number>,
  user: BooleanFields,
): { added: number[]; removed: number[] } {
  const added: number[] = []
  const removed: number[] = []
  for (const role of builtInRoles) {
    const predicate = BUILT_IN_ROLE_PREDICATES[role.key as BuiltInRoleKey]
    const isDesired = predicate?.(user) ?? false
    const isAssigned = existingRoleIds.has(role.id)
    if (isDesired && !isAssigned) added.push(role.id)
    else if (!isDesired && isAssigned) removed.push(role.id)
  }
  return { added, removed }
}

export async function syncBuiltInRoleAssignments(
  db: TransactionClient,
  userId: number,
  congregationId: number,
  actorId: number | null,
): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      isMale: true,
      isPublisher: true,
      baptismDate: true,
      isAnointed: true,
      isHelder: true,
      isServant: true,
    },
  })
  if (!user) return

  const builtInRoles = await db.role.findMany({
    where: { isBuiltIn: true },
    select: { id: true, key: true },
  })

  const existingAssignments = await db.userRoleAssignment.findMany({
    where: { userId },
    select: { roleId: true },
  })
  const existingRoleIds = new Set(existingAssignments.map(a => a.roleId))

  const { added, removed } = diffBuiltInAssignments(builtInRoles, existingRoleIds, user)

  if (added.length === 0 && removed.length === 0) return

  if (added.length > 0) {
    await db.userRoleAssignment.createMany({
      data: added.map(roleId => ({ userId, roleId, congregationId })),
    })
  }

  if (removed.length > 0) {
    await db.userRoleAssignment.deleteMany({
      where: { userId, roleId: { in: removed } },
    })
  }

  const keyById = new Map(builtInRoles.map(r => [r.id, r.key]))
  audit({
    action: AuditAction.RoleAssignmentsSynced,
    congregationId,
    actorId: actorId ?? undefined,
    entityType: 'User',
    entityId: userId,
    metadata: {
      added: added.map(id => keyById.get(id)).filter(Boolean),
      removed: removed.map(id => keyById.get(id)).filter(Boolean),
    },
  })
}
