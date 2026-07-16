import { createContext, type RouterContext, redirect } from 'react-router'
import type { SanitizedAccount } from '~/shared/auth/sanitize-account.server'
import type { CongregationInfo } from '~/shared/domain/congregation.server'
import type { TransactionClient, TransactionOptions } from '~/shared/infra/db.server'
import { withScope } from '~/shared/infra/db.server'
import type { Permission } from '~/shared/types/permission'

// Typed context keys for auth middleware → loader/action communication
export const currentAccountContext = createContext<SanitizedAccount>()
export const congregationContext = createContext<CongregationInfo>()
export const permissionsContext = createContext<Set<Permission>>()

interface RouteContext {
  get<T>(context: RouterContext<T>): T
}

/**
 * Convenience helper: reads congregationId from context and runs fn inside withScope.
 * Use in loaders/actions that need scoped DB access after middleware has run.
 *
 * `options` is forwarded to the underlying `db.$transaction` — use it to
 * extend the 5s default `timeout` for batch actions (bulk release, imports).
 */
export function withScopeFromContext<T>(
  context: RouteContext,
  fn: (db: TransactionClient) => Promise<T>,
  options?: TransactionOptions,
): Promise<T> {
  const user = context.get(currentAccountContext)
  return withScope(user.congregationId, fn, options)
}

export function requirePermission(permissions: Set<Permission>, permission: Permission): void {
  if (!permissions.has(permission)) throw redirect('/')
}
