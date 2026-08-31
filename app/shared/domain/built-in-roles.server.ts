import { standingTypeFromEnrolments } from '~/features/publishers/model/pioneer-enrolment'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { PublisherType } from '~/shared/types/publisher-type'

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

/**
 * Roles that exist in every congregation but are **not** derived from Member flags.
 *
 * `BUILT_IN_ROLE_KEYS` above describes identity — who someone is in the congregation —
 * and `syncBuiltInRoleAssignments` reconciles those assignments automatically from the
 * Member row. A system role is the opposite: it carries authority, nothing about the
 * Member implies it, and it is only ever granted deliberately by an admin.
 *
 * Both kinds are stored with `isBuiltIn = true` so neither can be renamed or deleted,
 * which is why the sync must select by key list and not by that flag — see
 * `syncBuiltInRoleAssignments`.
 */
export const SYSTEM_ROLE_KEYS = ['admin'] as const

export type SystemRoleKey = (typeof SYSTEM_ROLE_KEYS)[number]

/**
 * The service committee, which exists in exactly this shape in every congregation.
 *
 * Three elders — the coordinator, the secretary and the service overseer — and most services
 * answer to one of them; the rest answer to the body of elders directly. Because that is
 * universal rather than a local arrangement, it is structure rather than something each
 * congregation types in.
 *
 * Stored like the identity roles — `isBuiltIn`, `name`/`description` null, display strings
 * resolved per-locale by `getRoleDisplayName` — but appointed by hand like the system roles,
 * so assignments live on `UserRoleAssignment`. Keeping the keys stable is what lets a default
 * permission set ship for "the secretary" and lets a handover revoke the outgoing holder's
 * permissions the moment the new one is seated.
 */
export const SERVICE_COMMITTEE_KEY = 'service-committee'
export const SERVICE_COMMITTEE_POST_KEYS = ['coordinator', 'secretary', 'service-overseer'] as const
export const APPOINTED_ROLE_KEYS = [SERVICE_COMMITTEE_KEY, ...SERVICE_COMMITTEE_POST_KEYS] as const

export type AppointedRoleKey = (typeof APPOINTED_ROLE_KEYS)[number]

const APPOINTED_KEY_SET: ReadonlySet<string> = new Set(APPOINTED_ROLE_KEYS)

/** True for the committee and its three posts — the roles whose place in the chart is fixed. */
export function isAppointedRoleKey(key: string): boolean {
  return APPOINTED_KEY_SET.has(key)
}

/** True for the three posts only. The committee itself is a box, never a seat someone holds. */
export function isServiceCommitteePostKey(key: string): key is (typeof SERVICE_COMMITTEE_POST_KEYS)[number] {
  return (SERVICE_COMMITTEE_POST_KEYS as readonly string[]).includes(key)
}

const IDENTITY_ROLE_KEYS: ReadonlySet<string> = new Set(BUILT_IN_ROLE_KEYS)

/**
 * True for the roles derived from Member flags, which attach to the Member and are
 * reconciled automatically. Everything else — custom roles and system roles alike —
 * attaches to the UserAccount and is granted by hand.
 *
 * Prefer this over reading `isBuiltIn`: both identity and system roles carry that flag,
 * so it answers "can this be deleted", not "who does it attach to".
 */
export function isIdentityRoleKey(key: string): boolean {
  return IDENTITY_ROLE_KEYS.has(key)
}

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
  // Any pioneer type — permanent, auxiliary, special, or missionary (everything but Normal).
  // Compare against the Prisma enum *names* (what the client returns), not the `@map`-ed DB strings —
  // the raw-string comparison silently stopped matching at the enum-conversion migration.
  pioneer: m => m.leftAt == null && m.isPublisher && m.baptismDate != null && m.type !== PublisherType.Normal,
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
  const row = await db.member.findUnique({
    where: { id_congregationId: { id: memberId, congregationId } },
    select: {
      isMale: true,
      isPublisher: true,
      baptismDate: true,
      isAnointed: true,
      isHelder: true,
      isServant: true,
      leftAt: true,
      // The pioneer predicate reads the member's stints, not the `Member.type` column. The column
      // is a cache of the same fact and can be stale — an edit to a stint's period changes whether
      // it is a standing status, and nothing forces the two to agree. Fetched as a nested select,
      // so this stays one round trip.
      pioneerEnrolments: {
        select: { type: true, startMonth: true, startYear: true, endMonth: true, endYear: true, monthlyGoal: true },
      },
    },
  })
  if (!row) return

  const { pioneerEnrolments, ...flags } = row
  const member: MemberFlags = { ...flags, type: standingTypeFromEnrolments(pioneerEnrolments) }

  // Scope by congregationId explicitly. Under RLS-scoped callers this is a
  // no-op (rows are already filtered), but callers that bypass RLS — e.g. the
  // seed scripts running as the DB owner — would otherwise match every
  // congregation's built-in roles and write cross-tenant assignments.
  // Selected by key list, not by `isBuiltIn`. System roles such as `admin` are also
  // stored with isBuiltIn = true but have no predicate here, and diffBuiltInAssignments
  // treats a role with no predicate as "not desired" — so matching on the flag would
  // silently strip an admin's assignment on the next sync of their Member row.
  const builtInRoles = await db.role.findMany({
    where: { key: { in: [...BUILT_IN_ROLE_KEYS] }, congregationId },
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
