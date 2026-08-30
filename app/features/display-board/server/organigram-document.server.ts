import { getOrganigram, type OrganigramNode } from '~/shared/domain/organigram.queries'
import type { TransactionClient } from '~/shared/infra/db.server'

// The organigram as a board document — the surface everyone reads.
//
// /congregation/roles/organigram sits behind `can-view-roles`, which most of the congregation
// does not hold. This is where they see the chart: gated only by `can-view-board` and the
// section's own visibility roles.
//
// A sibling file rather than another branch in dynamic-documents.server.ts, which is already
// 428 lines against a 350 hard limit and only passes CI because it is grandfathered.

export type { OrganigramNode }

/** Whether this congregation has a chart worth offering as a document. */
export async function hasOrganigram(db: TransactionClient, congregationId: number): Promise<boolean> {
  const count = await db.role.count({ where: { congregationId, showInOrganigram: true } })
  return count > 0
}

export function fetchOrganigramDocument(db: TransactionClient, congregationId: number): Promise<OrganigramNode[]> {
  return getOrganigram(db, congregationId)
}

/** The board card's one-line teaser, sized like the other dynamic documents' counts. */
export async function getOrganigramPreview(db: TransactionClient, congregationId: number): Promise<string | null> {
  const count = await db.role.count({ where: { congregationId, showInOrganigram: true } })
  return count > 0 ? `${count} services` : null
}

/**
 * When the chart last changed, for the "updated" stamp in the board viewer.
 *
 * Both halves matter: the roles carry the structure, and the members carry who sits in it. A
 * new elder joining the roster changes the document without any role row being touched, so
 * watching only `Role.updatedAt` would leave the board claiming stale content is current.
 */
export async function getOrganigramVersion(db: TransactionClient, congregationId: number): Promise<Date | null> {
  const roles = await db.role.findMany({
    where: { congregationId, showInOrganigram: true },
    select: { id: true, updatedAt: true },
  })
  if (roles.length === 0) return null

  const roleIds = roles.map(role => role.id)
  const holders = await db.member.findMany({
    where: {
      congregationId,
      leftAt: null,
      anonymizedAt: null,
      OR: [
        { roleAssignments: { some: { roleId: { in: roleIds } } } },
        { account: { roleAssignments: { some: { roleId: { in: roleIds } } } } },
      ],
    },
    select: { updatedAt: true },
  })

  const stamps = [...roles.map(role => role.updatedAt), ...holders.map(holder => holder.updatedAt)]
  return stamps.reduce<Date | null>((latest, at) => (latest == null || at > latest ? at : latest), null)
}
