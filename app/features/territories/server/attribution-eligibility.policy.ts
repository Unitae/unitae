import { findMembersWithAnyRole } from '~/shared/auth/permissions.server'
import { ConflictError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { getKindAllowedRoleIds } from './territory-kinds.queries'

/**
 * Role gating for territory attribution.
 *
 * Deliberately called from `createAttribution` / `updateAttribution` rather than
 * from the aggregate. Those two delegators are the human-initiated path — the
 * attribution routes — so posting straight at the route cannot slip past the
 * check, while `campaign-lifecycle.workflow` (which calls the aggregate
 * directly) stays exempt. That sweep re-attributes a pairing that already
 * existed, and it swallows ConflictError, so gating it would silently strip a
 * publisher's territory when a kind's roles change.
 */
export async function assertPublisherAllowedForKind(
  db: TransactionClient,
  kindKey: string,
  publisherId: number,
  congregationId: number,
): Promise<void> {
  const allowedRoleIds = await getKindAllowedRoleIds(db, kindKey, congregationId)
  if (allowedRoleIds.length === 0) return

  const eligibleIds = await findMembersWithAnyRole(db, allowedRoleIds, congregationId)
  if (!eligibleIds.includes(publisherId)) throw new ConflictError('publisher_role_not_allowed')
}

/**
 * Same check for an edit, where the kind has to be resolved through the
 * attribution's territory.
 *
 * Only a *change* of publisher is gated. Leaving the publisher as-is always
 * passes, so tightening a kind's roles never locks an existing attribution out
 * of being edited — it only stops that publisher being picked somewhere new.
 * This matches the picker, which keeps the current publisher listed.
 *
 * A missing attribution passes: the aggregate reports that as NotFoundError,
 * which is the accurate failure.
 */
export async function assertPublisherAllowedForAttribution(
  db: TransactionClient,
  attributionId: number,
  publisherId: number,
  congregationId: number,
): Promise<void> {
  const attribution = await db.attribution.findFirst({
    where: { id: attributionId, congregationId },
    select: { publisherId: true, territory: { select: { type: true } } },
  })
  if (attribution == null) return
  if (attribution.publisherId === publisherId) return

  await assertPublisherAllowedForKind(db, attribution.territory.type, publisherId, congregationId)
}
