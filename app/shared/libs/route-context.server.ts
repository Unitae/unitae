import { createContext, type RouterContext } from 'react-router'
import type { SanitizedUser } from '~/features/authentication/server/sanitize-user.server'
import type { Role } from '~/features/authorization/model/roles.type'
import type { CongregationInfo } from './congregation.server'
import type { TransactionClient } from './db.server'
import { withScope } from './db.server'

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
