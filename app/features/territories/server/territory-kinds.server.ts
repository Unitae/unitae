import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'

/**
 * The keys of the built-in territory kinds, as stored in `TerritoryKind.key`.
 * They are the mapped values of `TerritoryKindKey`, which still types
 * `Territory.type` — the two must stay in step until territories move onto the FK.
 */
export const BUILT_IN_TERRITORY_KIND_KEYS = Object.values(TerritoryKindKey)

/**
 * Idempotent per-congregation seeding of the built-in kinds, mirroring
 * `seedBuiltInRoles`. Existing congregations were seeded by the migration that
 * created the table; this covers congregations created afterwards.
 *
 * Built-ins carry no `name` — the label comes from i18n, as it does for Role.
 */
// biome-ignore lint/suspicious/noExplicitAny: accepts both PrismaClient and scoped transaction client
export async function seedBuiltInTerritoryKinds(db: any, congregationId: number) {
  for (const key of BUILT_IN_TERRITORY_KIND_KEYS) {
    await db.territoryKind.upsert({
      // biome-ignore lint/style/useNamingConvention: Prisma compound-key naming
      where: { key_congregationId: { key, congregationId } },
      update: { isBuiltIn: true },
      create: { key, isBuiltIn: true, congregationId },
    })
  }
}

export interface DiffResult {
  added: number[]
  removed: number[]
}

function diffRoleIds(previous: number[], desired: number[]): DiffResult {
  const previousSet = new Set(previous)
  const desiredSet = new Set(desired)
  return {
    added: desired.filter(id => !previousSet.has(id)),
    removed: previous.filter(id => !desiredSet.has(id)),
  }
}

/**
 * Replace the roles a publisher must hold to be attributed a territory of this
 * kind. An empty `desiredRoleIds` clears the restriction — no rows means any
 * active publisher qualifies.
 *
 * No transaction wrapper: the caller's `withScopeFromContext` already provides one.
 */
export async function setKindAllowedRoles(
  db: TransactionClient,
  kindKey: string,
  desiredRoleIds: number[],
  congregationId: number,
  actorId: number,
): Promise<DiffResult> {
  const kind = await db.territoryKind.findFirst({
    where: { key: kindKey, congregationId },
    select: { id: true },
  })
  if (kind == null) throw new NotFoundError('TerritoryKind')

  const previous = await db.territoryKindAllowedRole.findMany({
    where: { kindId: kind.id, congregationId },
    select: { roleId: true },
  })
  const diff = diffRoleIds(
    previous.map(row => row.roleId),
    desiredRoleIds,
  )
  if (diff.added.length === 0 && diff.removed.length === 0) return diff

  if (diff.removed.length > 0) {
    await db.territoryKindAllowedRole.deleteMany({
      where: { kindId: kind.id, congregationId, roleId: { in: diff.removed } },
    })
  }
  if (diff.added.length > 0) {
    await db.territoryKindAllowedRole.createMany({
      data: diff.added.map(roleId => ({ kindId: kind.id, roleId, congregationId })),
      skipDuplicates: true,
    })
  }

  audit({
    action: AuditAction.TerritoryKindAllowedRolesChanged,
    congregationId,
    actorId,
    entityType: 'TerritoryKind',
    entityId: kind.id,
    metadata: { key: kindKey, added: diff.added, removed: diff.removed },
  })

  return diff
}
