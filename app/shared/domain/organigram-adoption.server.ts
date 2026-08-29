import { AuditAction, audit } from '~/shared/domain/audit.server'
import {
  APPOINTED_ROLE_KEYS,
  isAppointedRoleKey,
  SERVICE_COMMITTEE_KEY,
  SERVICE_COMMITTEE_POST_KEYS,
} from '~/shared/domain/built-in-roles.server'
import { syncServiceCommitteeMembers } from '~/shared/domain/service-committee.server'
import { ForbiddenError, NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { getRoleDisplayName } from '~/shared/types/role'

// Adopting the standard service committee, for congregations that built a chart before it existed.
//
// They already have their own «Comité de service» and «Coordinateur» with people seated on them.
// The migration gave them the built-in posts but left them out of the chart precisely so this
// step can propose a mapping rather than guessing one: a wrong match here moves people and
// permissions, and doing that silently is the failure nobody would notice until it mattered.

/** Siblings are spaced 5 apart, matching `organigram.server.ts`. */
const ORDER_STEP = 5

/**
 * Slug fragments that suggest a congregation's own role fills a given post.
 *
 * Matched against the role *key*, which `createRole` slugifies from the name, so accents and
 * case are already gone. Deliberately a suggestion and never a decision — the admin confirms
 * every one, and a post with no confident match is offered blank.
 */
const POST_HINTS: Record<string, string[]> = {
  [SERVICE_COMMITTEE_KEY]: ['comite-de-service', 'comite-service', 'service-committee'],
  coordinator: ['coordinateur', 'coordinator', 'coordonnateur'],
  secretary: ['secretaire', 'secretary'],
  'service-overseer': [
    'surveillant-du-service',
    'surveillant-service',
    'responsable-pour-la-predication',
    'responsable-predication',
    'service-overseer',
  ],
}

export interface AdoptionPost {
  key: string
  name: string
  /** The congregation's own role that most likely fills this post, or null when none is close. */
  suggestedRoleId: number | null
}

export interface AdoptionCandidate {
  id: number
  name: string
}

export interface AdoptionProposal {
  alreadyAdopted: boolean
  posts: AdoptionPost[]
  candidates: AdoptionCandidate[]
}

interface RoleRow {
  id: number
  key: string
  name: string | null
  parentRoleId: number | null
  showInOrganigram?: boolean
}

function bestMatch(postKey: string, candidates: RoleRow[]): number | null {
  const hints = POST_HINTS[postKey] ?? []
  // Longest hint first, so «responsable-pour-la-predication» is preferred over a bare
  // «responsable» that happens to be a different service entirely.
  for (const hint of [...hints].sort((a, b) => b.length - a.length)) {
    const found = candidates.find(role => role.key === hint) ?? candidates.find(role => role.key.startsWith(hint))
    if (found) return found.id
  }
  return null
}

/** What the confirmation screen shows: one row per post, plus every node it could point at. */
export async function proposeCommitteeAdoption(
  db: TransactionClient,
  congregationId: number,
): Promise<AdoptionProposal> {
  const roles: RoleRow[] = await db.role.findMany({
    where: { congregationId },
    select: { id: true, key: true, name: true, parentRoleId: true, showInOrganigram: true },
  })

  const committee = roles.find(role => role.key === SERVICE_COMMITTEE_KEY)
  if (committee?.showInOrganigram) return { alreadyAdopted: true, posts: [], candidates: [] }

  // Only nodes already on the chart are worth offering: a role the congregation never placed is
  // not the thing their committee is currently represented by.
  const candidates = roles.filter(role => role.showInOrganigram && !isAppointedRoleKey(role.key))

  return {
    alreadyAdopted: false,
    posts: APPOINTED_ROLE_KEYS.map(key => ({
      key,
      name: getRoleDisplayName({ key, name: null }),
      suggestedRoleId: bestMatch(key, candidates),
    })),
    candidates: candidates.map(role => ({ id: role.id, name: getRoleDisplayName(role) })),
  }
}

/**
 * Move one hand-made role's contents onto the post that replaces it.
 *
 * Permissions are copied rather than moved: the old role may still gate part eligibility or be
 * assigned outside the chart, and moving a permission off it would revoke access that has
 * nothing to do with the organigram. The role itself survives, off the chart.
 */
async function carryOver(
  db: TransactionClient,
  sourceId: number,
  targetId: number,
  congregationId: number,
  { moveHolder }: { moveHolder: boolean },
): Promise<void> {
  const permissions: { permissionId: number }[] = await db.rolePermission.findMany({
    where: { roleId: sourceId, congregationId },
    select: { permissionId: true },
  })
  if (permissions.length > 0) {
    await db.rolePermission.createMany({
      data: permissions.map(permission => ({
        roleId: targetId,
        permissionId: permission.permissionId,
        congregationId,
      })),
      skipDuplicates: true,
    })
  }

  // A post holds one person. Where the old role had several, the leader moves and the rest stay
  // behind on it — the role still exists, so nobody loses anything they had.
  const holders: { userId: number; kind: string }[] = moveHolder
    ? await db.userRoleAssignment.findMany({
        where: { roleId: sourceId, congregationId },
        select: { userId: true, kind: true },
      })
    : []
  const incoming = holders.find(holder => holder.kind === 'leader') ?? holders[0]
  if (incoming) {
    await db.userRoleAssignment.create({
      data: { userId: incoming.userId, roleId: targetId, congregationId, kind: 'leader' },
    })
    await db.userRoleAssignment.deleteMany({ where: { userId: incoming.userId, roleId: sourceId, congregationId } })
  }

  await db.role.updateMany({ where: { congregationId, parentRoleId: sourceId }, data: { parentRoleId: targetId } })

  await db.role.update({
    where: { id_congregationId: { id: sourceId, congregationId } },
    data: { showInOrganigram: false, parentRoleId: null, organigramOrder: null },
  })
}

export interface AdoptionChoice {
  postKey: string
  fromRoleId: number | null
}

/**
 * Place the standard committee, carrying across whatever the congregation had built by hand.
 *
 * For each mapped role: its holder moves onto the post, its permissions are **copied** (not
 * moved — the old role may still gate part eligibility or be assigned outside the chart, and
 * moving a permission off it would revoke access that has nothing to do with the organigram),
 * the services reporting to it are re-hung under the post, and the role itself leaves the chart
 * without being deleted.
 */
export async function adoptServiceCommittee(
  db: TransactionClient,
  choices: AdoptionChoice[],
  congregationId: number,
  actorId: number,
): Promise<void> {
  const roles: RoleRow[] = await db.role.findMany({
    where: { congregationId },
    select: { id: true, key: true, name: true, parentRoleId: true, showInOrganigram: true },
  })
  const byKey = new Map(roles.map(role => [role.key, role]))
  const byId = new Map(roles.map(role => [role.id, role]))

  const elder = byKey.get('elder')
  const committee = byKey.get(SERVICE_COMMITTEE_KEY)
  if (!committee) throw new NotFoundError('Role', 0)

  const place = (id: number, parentRoleId: number | null, order: number) =>
    db.role.update({
      where: { id_congregationId: { id, congregationId } },
      data: { showInOrganigram: true, parentRoleId, organigramOrder: order },
    })

  await place(committee.id, elder?.id ?? null, ORDER_STEP)
  for (const [index, key] of SERVICE_COMMITTEE_POST_KEYS.entries()) {
    const post = byKey.get(key)
    if (post) await place(post.id, committee.id, (index + 1) * ORDER_STEP)
  }

  for (const choice of choices) {
    if (choice.fromRoleId == null) continue
    const target = byKey.get(choice.postKey)
    const source = byId.get(choice.fromRoleId)
    if (!target || !source) throw new NotFoundError('Role', choice.fromRoleId)
    // Mapping one built-in post onto another is meaningless and would move seats between posts.
    if (isAppointedRoleKey(source.key)) throw new ForbiddenError('Cet élément ne peut pas être repris.')

    // The committee's own membership is derived from its three posts, so moving a holder onto
    // it would be reconciled straight back off — a change the admin would watch undo itself.
    await carryOver(db, source.id, target.id, congregationId, { moveHolder: target.key !== SERVICE_COMMITTEE_KEY })
  }

  // Whatever the mapping filled the three posts with is what the committee is made of.
  await syncServiceCommitteeMembers(db, congregationId, actorId)

  audit({
    action: AuditAction.OrganigramChanged,
    congregationId,
    actorId,
    entityType: 'Role',
    entityId: committee.id,
    metadata: { change: 'committee-adopted', mapped: choices.filter(choice => choice.fromRoleId != null) },
  })
}
