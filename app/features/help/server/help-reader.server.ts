import type { HelpReader } from '~/features/help/model/help-access'
import type { SanitizedAccount } from '~/shared/auth/sanitize-account.server'
import type { Permission } from '~/shared/types/permission'

/**
 * The reader the help checks articles against: the account's permissions, whether its record leads a group, and
 * whether it answers for a schedule template (the caller asks the events feature: answersForASchedule).
 */
export function helpReaderFor(
  permissions: ReadonlySet<Permission>,
  account: SanitizedAccount,
  answersForSchedule = false,
): HelpReader {
  return {
    permissions,
    leadsGroup: account.member?.responsibleFor != null || account.member?.deputyFor != null,
    answersForSchedule,
  }
}
