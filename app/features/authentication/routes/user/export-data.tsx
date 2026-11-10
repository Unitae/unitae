import { currentAccountContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { accountDataDownload, exportAccountData } from '~/shared/domain/export-account-data.server'
import type { Route } from './+types/export-data'

/**
 * Loader only: the signed-in person downloads everything the app keeps about them (GDPR articles 15 and 20). Open
 * to every account — the administrators' download sits under the settings, behind their rights.
 */
export function loader({ context }: Route.LoaderArgs) {
  const account = context.get(currentAccountContext)

  return withScopeFromContext(context, async (db, congregationId) => {
    const data = await exportAccountData(db, account.id, congregationId)

    audit({
      action: AuditAction.UserDataExported,
      congregationId,
      actorId: account.id,
      entityType: 'UserAccount',
      entityId: account.id,
    })

    return accountDataDownload(data, account.id)
  })
}
