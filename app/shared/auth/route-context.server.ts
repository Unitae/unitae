import { createContext, type RouterContext } from 'react-router'
import type { SanitizedUser } from '~/shared/auth/sanitize-user.server'
import type { CongregationInfo } from '~/shared/domain/congregation.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { withScope } from '~/shared/infra/db.server'
import type { Role } from '~/shared/types/role'

// Typed context keys for auth middleware → loader/action communication
export const userContext = createContext<SanitizedUser>()
export const congregationContext = createContext<CongregationInfo>()
export const permissionsContext = createContext<Set<Role>>()

interface RouteContext {
  get<T>(context: RouterContext<T>): T
}

/**
 * Convenience helper: reads congregationId from context and runs fn inside withScope.
 * Use in loaders/actions that need scoped DB access after middleware has run.
 */
export function withScopeFromContext<T>(context: RouteContext, fn: (db: TransactionClient) => Promise<T>): Promise<T> {
  const user = context.get(userContext)
  return withScope(user.congregationId, fn)
}
