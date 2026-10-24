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
 * The callback receives `(db, congregationId)` — thread that `congregationId`
 * into service calls so their `where` clauses scope by it (defence-in-depth
 * over RLS) instead of re-reading it from context.
 *
 * `options` is forwarded to the underlying `db.$transaction` — use it to
 * extend the 5s default `timeout` for batch actions (bulk release, imports).
 */
export function withScopeFromContext<T>(
  context: RouteContext,
  fn: (db: TransactionClient, congregationId: number) => Promise<T>,
  options?: TransactionOptions,
): Promise<T> {
  const user = context.get(currentAccountContext)
  return withScope(user.congregationId, fn, options)
}

export function requirePermission(permissions: Set<Permission>, permission: Permission): void {
  if (!permissions.has(permission)) throw redirect('/')
}

/**
 * A layout's access gate, as route middleware. Gate layouts with this rather than in their loader:
 * React Router runs only the leaf route's action on a submission, so a loader check never covers a
 * child's action, while middleware runs before every child loader, action and resource route.
 * Child actions still check the specific permission they need when the layout admits several.
 */
export function layoutGate(allows: (permissions: Set<Permission>, account: SanitizedAccount) => boolean) {
  return ({ context }: { context: RouteContext }): void => {
    if (!allows(context.get(permissionsContext), context.get(currentAccountContext))) throw redirect('/')
  }
}
