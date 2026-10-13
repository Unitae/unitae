import { unscopedDb } from '~/shared/infra/db.server'

type LoginAccount = { id: number } | { email: string }

/**
 * The congregation whose audit log a sign-in event belongs in: the one the URL names, or else the
 * account's own. Without that second step, a host that names no congregation — every single-tenant
 * instance, and the base domain of a multi-tenant one — recorded no sign-in at all.
 *
 * `null` when there is neither, which is a failed attempt on an email no account uses: an audit
 * entry needs a congregation, and that attempt belongs to none.
 */
export async function resolveLoginAuditCongregationId(
  urlCongregationId: number | undefined,
  account: LoginAccount,
): Promise<number | null> {
  if (urlCongregationId != null) return urlCongregationId

  const row = await unscopedDb.userAccount.findFirst({
    where: 'id' in account ? { id: account.id } : { email: account.email.toLowerCase() },
    select: { congregationId: true },
  })

  return row?.congregationId ?? null
}
