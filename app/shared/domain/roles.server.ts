import { requireNotLastAdmin } from '~/shared/auth/permissions.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { BUILT_IN_ROLE_KEYS, isIdentityRoleKey, SYSTEM_ROLE_KEYS } from '~/shared/domain/built-in-roles.server'
import { ConflictError, ForbiddenError, ValidationError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { Permission } from '~/shared/types/permission'
import { getRoleDisplayName } from '~/shared/types/role'

// Identity roles first, in their canonical order, then system roles. Both carry
// isBuiltIn, so a single map over BUILT_IN_ROLE_KEYS left `admin` unranked — and
// `?? 0` then sorted it level with `member` rather than after the identity block.
const BUILT_IN_ORDER = new Map<string, number>([
  ...BUILT_IN_ROLE_KEYS.map((key, index) => [key, index] as const),
  ...SYSTEM_ROLE_KEYS.map((key, index) => [key, BUILT_IN_ROLE_KEYS.length + index] as const),
])

/**
 * Roles that attach to a UserAccount and are granted by hand: custom roles, plus system
 * roles such as `admin`. Identity roles are excluded — they live on the Member and are
 * reconciled from its flags, so accepting one here would be overwritten on the next sync.
 *
 * Defined once because it is needed on both sides of the assignment diff, and a filter
 * that drifted between the two would drop `admin` from the desired set while leaving it
 * in the existing set — which reads as "no change" and silently refuses the grant.
 */
function accountAssignableRole() {
  return { OR: [{ isBuiltIn: false }, { key: { in: [...SYSTEM_ROLE_KEYS] } }] }
}

export interface RoleListItem {
  id: number
  key: string
  name: string | null
  description: string | null
  isBuiltIn: boolean
  permissionCount: number
  memberCount: number
}

export async function listRoles(db: TransactionClient, congregationId: number): Promise<RoleListItem[]> {
  const roles = await db.role.findMany({
    where: { congregationId },
    include: {
      _count: { select: { permissions: true, members: true } },
    },
  })

  return roles
    .map(role => ({
      id: role.id,
      key: role.key,
      name: role.name,
      description: role.description,
      isBuiltIn: role.isBuiltIn,
      permissionCount: role._count.permissions,
      memberCount: role._count.members,
    }))
    .sort((a, b) => {
      if (a.isBuiltIn && b.isBuiltIn) {
        // Number.MAX_SAFE_INTEGER, not 0: an unranked key belongs after everything
        // ranked, and defaulting to 0 silently promotes it to the front instead.
        const orderA = BUILT_IN_ORDER.get(a.key) ?? Number.MAX_SAFE_INTEGER
        const orderB = BUILT_IN_ORDER.get(b.key) ?? Number.MAX_SAFE_INTEGER
        return orderA - orderB
      }
      if (a.isBuiltIn) return -1
      if (b.isBuiltIn) return 1
      return getRoleDisplayName(a).localeCompare(getRoleDisplayName(b))
    })
}

export interface RoleDetail {
  id: number
  key: string
  name: string | null
  description: string | null
  isBuiltIn: boolean
  permissionKeys: string[]
  memberCount: number
}

export async function getRole(db: TransactionClient, id: number, congregationId: number): Promise<RoleDetail | null> {
  const role = await db.role.findFirst({
    where: { id, congregationId },
    include: {
      permissions: { include: { permission: true } },
      _count: { select: { members: true } },
    },
  })

  if (!role) return null

  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    isBuiltIn: role.isBuiltIn,
    permissionKeys: role.permissions.map(rp => rp.permission.key),
    memberCount: role._count.members,
  }
}

export interface CreateRoleParams {
  name: string
  description: string | null
  permissionKeys: string[]
}

export async function createRole(
  db: TransactionClient,
  congregationId: number,
  actorId: number,
  params: CreateRoleParams,
): Promise<{ id: number; key: string }> {
  const trimmedName = params.name.trim()
  if (trimmedName.length === 0) throw new ValidationError('name', 'Name is required')

  const key = slugifyRoleKey(trimmedName)
  if (key.length === 0) throw new ValidationError('name', 'Name must contain at least one alphanumeric character')

  const existing = await db.role.findFirst({ where: { key, congregationId }, select: { id: true } })
  if (existing) throw new ConflictError(`A role with key "${key}" already exists`)

  const role = await db.role.create({
    data: {
      key,
      name: trimmedName,
      description: params.description?.trim() || null,
      isBuiltIn: false,
      congregationId,
    },
    select: { id: true, key: true },
  })

  if (params.permissionKeys.length > 0) {
    await syncRolePermissions(db, role.id, congregationId, [], params.permissionKeys)
  }

  audit({
    action: AuditAction.RoleCreated,
    congregationId,
    actorId,
    entityType: 'Role',
    entityId: role.id,
    metadata: { key, name: trimmedName, permissionKeys: params.permissionKeys },
  })

  return role
}

export interface UpdateRoleIdentityParams {
  name?: string
  description?: string | null
}

export async function updateRoleIdentity(
  db: TransactionClient,
  id: number,
  congregationId: number,
  actorId: number,
  params: UpdateRoleIdentityParams,
): Promise<void> {
  const role = await db.role.findFirst({ where: { id, congregationId } })
  if (!role) return

  if (role.isBuiltIn) {
    throw new ForbiddenError('Built-in role identity is sourced from i18n and cannot be edited')
  }

  const fieldsChanged: string[] = []
  const data: { name?: string; description?: string | null } = {}

  if (params.name !== undefined) {
    const trimmed = params.name.trim()
    if (trimmed.length === 0) throw new ValidationError('name', 'Name is required')
    if (trimmed !== role.name) {
      data.name = trimmed
      fieldsChanged.push('name')
    }
  }

  if (params.description !== undefined) {
    const trimmed = params.description?.trim() || null
    const previous = role.description?.trim() || null
    if (trimmed !== previous) {
      data.description = trimmed
      fieldsChanged.push('description')
    }
  }

  if (fieldsChanged.length === 0) return

  await db.role.update({ where: { id_congregationId: { id, congregationId } }, data })
  audit({
    action: AuditAction.RoleUpdated,
    congregationId,
    actorId,
    entityType: 'Role',
    entityId: id,
    metadata: { fieldsChanged },
  })
}

export async function updateRolePermissions(
  db: TransactionClient,
  id: number,
  congregationId: number,
  actorId: number,
  permissionKeys: string[],
): Promise<void> {
  const role = await db.role.findFirst({
    where: { id, congregationId },
    include: { permissions: { include: { permission: true } } },
  })
  if (!role) return

  const previousKeys = role.permissions.map(rp => rp.permission.key)
  await syncRolePermissions(db, id, congregationId, previousKeys, permissionKeys, actorId)
}

export async function addUserToRole(
  db: TransactionClient,
  userId: number,
  roleId: number,
  congregationId: number,
  actorId: number,
): Promise<void> {
  const role = await db.role.findFirst({ where: { id: roleId, congregationId } })
  if (!role) return

  // Identity roles only. System roles such as `admin` are also isBuiltIn — undeletable —
  // but they are granted by hand, so gating on the flag would wrongly refuse them.
  if (isIdentityRoleKey(role.key)) {
    throw new ForbiddenError('Identity role memberships are managed automatically')
  }

  const existing = await db.userRoleAssignment.findFirst({
    where: { userId, roleId },
    select: { userId: true },
  })
  if (existing) return

  await db.userRoleAssignment.create({ data: { userId, roleId, congregationId } })

  audit({
    action: AuditAction.UserRoleAssignmentChanged,
    congregationId,
    actorId,
    entityType: 'User',
    entityId: userId,
    metadata: { added: [role.key], removed: [] },
  })
}

export async function removeUserFromRole(
  db: TransactionClient,
  userId: number,
  roleId: number,
  congregationId: number,
  actorId: number,
): Promise<void> {
  const role = await db.role.findFirst({ where: { id: roleId, congregationId } })
  if (!role) return

  // Identity roles only. System roles such as `admin` are also isBuiltIn — undeletable —
  // but they are granted by hand, so gating on the flag would wrongly refuse them.
  if (isIdentityRoleKey(role.key)) {
    throw new ForbiddenError('Identity role memberships are managed automatically')
  }

  const existing = await db.userRoleAssignment.findFirst({
    where: { userId, roleId },
    select: { userId: true },
  })
  if (!existing) return

  await db.userRoleAssignment.deleteMany({ where: { userId, roleId } })

  audit({
    action: AuditAction.UserRoleAssignmentChanged,
    congregationId,
    actorId,
    entityType: 'User',
    entityId: userId,
    metadata: { added: [], removed: [role.key] },
  })
}

export async function deleteRole(
  db: TransactionClient,
  id: number,
  congregationId: number,
  actorId: number,
): Promise<void> {
  const role = await db.role.findFirst({
    where: { id, congregationId },
    include: { _count: { select: { members: true } } },
  })
  if (!role) return

  if (role.isBuiltIn) {
    throw new ForbiddenError('Built-in roles cannot be deleted')
  }

  // The organigram's self-referencing FK is ON DELETE RESTRICT, so deleting a role that others
  // report to fails in Postgres with a constraint name and nothing an admin can act on. Check
  // first and say which roles are in the way — the delete page renders this as its impact text.
  const children = await db.role.findMany({
    where: { parentRoleId: id, congregationId },
    select: { key: true, name: true },
  })
  if (children.length > 0) {
    const names = children.map(child => child.name ?? child.key).join(', ')
    throw new ConflictError(
      `Ce rôle a des rôles rattachés dans l’organigramme : ${names}. Déplacez-les avant de le supprimer.`,
    )
  }

  await db.role.delete({ where: { id_congregationId: { id, congregationId } } })

  audit({
    action: AuditAction.RoleDeleted,
    congregationId,
    actorId,
    entityType: 'Role',
    entityId: id,
    metadata: { key: role.key, name: role.name, memberCount: role._count.members },
  })
}

export async function setUserCustomRoleAssignments(
  db: TransactionClient,
  userId: number,
  congregationId: number,
  actorId: number,
  customRoleIds: number[],
): Promise<void> {
  // Account-assignable = custom roles plus system roles such as `admin`. Identity
  // roles are excluded: they live on the Member and are reconciled from its flags by
  // syncBuiltInRoleAssignments, so accepting one here would be overwritten anyway.
  // Filtering on `isBuiltIn: false` alone would silently drop `admin` from both the
  // desired set and the existing set, making it impossible to grant through the UI.
  const customRoles = await db.role.findMany({
    where: { congregationId, ...accountAssignableRole() },
    select: { id: true, key: true },
  })
  const customRoleIdSet = new Set(customRoles.map(r => r.id))
  const desired = new Set(customRoleIds.filter(id => customRoleIdSet.has(id)))

  const existing = await db.userRoleAssignment.findMany({
    where: { userId, role: accountAssignableRole() },
    select: { roleId: true },
  })
  const existingIds = new Set(existing.map(a => a.roleId))

  const added: number[] = []
  const removed: number[] = []
  for (const id of desired) {
    if (!existingIds.has(id)) added.push(id)
  }
  for (const id of existingIds) {
    if (!desired.has(id)) removed.push(id)
  }

  if (added.length === 0 && removed.length === 0) return

  // If any removed role granted Admin, this update could strip the user's
  // admin power. Guard against leaving the congregation without an admin.
  if (removed.length > 0) {
    const removedRolesWithAdmin = await db.rolePermission.findFirst({
      where: {
        roleId: { in: removed },
        congregationId,
        permission: { key: Permission.CanDoAnything },
      },
      select: { roleId: true },
    })
    if (removedRolesWithAdmin) {
      await requireNotLastAdmin(userId, congregationId)
    }
  }

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

  const keyById = new Map(customRoles.map(r => [r.id, r.key]))
  audit({
    action: AuditAction.UserRoleAssignmentChanged,
    congregationId,
    actorId,
    entityType: 'User',
    entityId: userId,
    metadata: {
      added: added.map(id => keyById.get(id)).filter(Boolean),
      removed: removed.map(id => keyById.get(id)).filter(Boolean),
    },
  })
}

async function syncRolePermissions(
  db: TransactionClient,
  roleId: number,
  congregationId: number,
  previousKeys: string[],
  desiredKeys: string[],
  actorId?: number,
): Promise<void> {
  const previous = new Set(previousKeys)
  const desired = new Set(desiredKeys)

  const added = [...desired].filter(k => !previous.has(k))
  const removed = [...previous].filter(k => !desired.has(k))

  if (added.length === 0 && removed.length === 0) return

  const permissions = await db.permission.findMany({
    where: { key: { in: [...added, ...removed] } },
    select: { id: true, key: true },
  })
  const idByKey = new Map(permissions.map(p => [p.key, p.id]))

  const addedIds = added.map(key => idByKey.get(key)).filter((id): id is number => typeof id === 'number')
  const removedIds = removed.map(key => idByKey.get(key)).filter((id): id is number => typeof id === 'number')

  if (addedIds.length > 0) {
    await db.rolePermission.createMany({
      data: addedIds.map(permissionId => ({ roleId, permissionId, congregationId })),
      skipDuplicates: true,
    })
  }

  if (removedIds.length > 0) {
    await db.rolePermission.deleteMany({
      where: { roleId, permissionId: { in: removedIds } },
    })
  }

  if (actorId !== undefined) {
    audit({
      action: AuditAction.RolePermissionChanged,
      congregationId,
      actorId,
      entityType: 'Role',
      entityId: roleId,
      metadata: { added, removed },
    })
  }
}

function slugifyRoleKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
