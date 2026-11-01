import type { Locale } from '~/i18n/paraglide/runtime'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { unscopedDb as db } from '~/shared/infra/db.server'

/**
 * Sets the interface language an account chose for itself; `null` makes it follow its
 * congregation's again. Resolves to whether anything changed: the caller reloads the page only
 * then, since a new language shows on a full page load alone.
 */
export async function setAccountLocale(
  accountId: number,
  congregationId: number,
  locale: Locale | null,
  actorId: number,
): Promise<boolean> {
  const account = await db.userAccount.findFirst({
    where: { id: accountId, congregationId },
    select: { locale: true },
  })
  if (!account || account.locale === locale) return false

  await db.userAccount.update({
    where: { id: accountId, congregationId },
    data: { locale },
  })

  audit({
    action: AuditAction.UserLocaleChanged,
    congregationId,
    actorId,
    entityType: 'User',
    entityId: accountId,
    metadata: { from: account.locale, to: locale },
  })
  return true
}
