// Helpers for route-action tests: a router context carrying the caller's permissions, and a way to
// read the Response an action returns or throws (react-router redirects are thrown Responses).
import { congregationContext, currentAccountContext, permissionsContext } from '~/shared/auth/route-context.server'
import type { Permission } from '~/shared/types/permission'

export interface FakeCaller {
  id?: number
  congregationId?: number
  member?: { id: number; publisherGroupId?: number | null; responsibleFor?: unknown; deputyFor?: unknown } | null
}

export function routeContext(permissions: Permission[], caller: FakeCaller = {}) {
  const values = new Map<unknown, unknown>([
    [permissionsContext, new Set(permissions)],
    [currentAccountContext, { id: 7, congregationId: 1, member: null, firstname: 'Ada', lastname: 'Admin', ...caller }],
    [
      congregationContext,
      { id: 1, timezone: 'Europe/Paris', locale: 'fr', baseUrl: 'https://unitae.example.test', displayName: 'Unitae' },
    ],
  ])
  return { get: (key: unknown) => values.get(key) }
}

export function formRequest(url: string, fields: Record<string, string>): Request {
  return new Request(url, { method: 'POST', body: new URLSearchParams(fields) })
}

/** The Response an action returned or threw; anything else fails the test. */
export async function respond(run: () => unknown): Promise<Response> {
  try {
    const result = await run()
    if (result instanceof Response) return result
    throw new Error(`expected a Response, got ${JSON.stringify(result)}`)
  } catch (thrown) {
    if (thrown instanceof Response) return thrown
    throw thrown
  }
}
