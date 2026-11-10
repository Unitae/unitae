import { receivesRoleNotifications } from '~/shared/auth/permissions.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { Permission } from '~/shared/types/permission'
import type { NotificationTypeDefinition } from '../model/notification-definition'
import { isCancellationType } from '../model/notification-event.type'
import { NOTIFICATION_REGISTRY } from './registry.server'

/** The account whose preferences page is being drawn. */
export interface NotificationReader {
  accountId: number
  congregationId: number
  /** Linked to a publisher record: the only accounts a part or a service can be attributed to. */
  hasMember: boolean
  /** Its effective permissions, for types sent to whoever took an action. */
  permissions: ReadonlySet<Permission>
}

function recipientRoleOf(definition: NotificationTypeDefinition): Permission | null {
  const routing = isCancellationType(definition.routing) ? definition.routing.fallback : definition.routing
  return routing.recipientStrategy === 'role' && routing.recipientRole ? (routing.recipientRole as Permission) : null
}

/**
 * The notification types that can ever reach this account, so its preferences page leaves out the others. Role
 * fan-out types ask the database with the delivery's own filter; the rest follow their declared audience.
 */
export async function reachableNotificationTypes(
  db: TransactionClient,
  reader: NotificationReader,
  definitions: Iterable<NotificationTypeDefinition> = NOTIFICATION_REGISTRY.values(),
): Promise<Set<string>> {
  const byRole = new Map<Permission, Promise<boolean>>()
  const receives = (role: Permission) => {
    let answer = byRole.get(role)
    if (answer == null) {
      answer = receivesRoleNotifications(db, reader.accountId, reader.congregationId, role)
      byRole.set(role, answer)
    }
    return answer
  }

  const reachable = new Set<string>()
  for (const definition of definitions) {
    const role = recipientRoleOf(definition)
    const audience = definition.audience
    let reaches = true
    if (role) reaches = await receives(role)
    else if (audience && 'member' in audience) reaches = reader.hasMember
    else if (audience) reaches = reader.permissions.has(audience.permission)
    if (reaches) reachable.add(definition.type)
  }
  return reachable
}
