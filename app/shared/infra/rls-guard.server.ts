import { unscopedDb } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'

interface RlsGuardInput {
  /** Whether `DB_RUNTIME_URL` is set — when unset, the runtime falls back to the superuser `DB_URL`. */
  runtimeUrlSet: boolean
  /** Whether the connected role is a superuser or has `BYPASSRLS` — such roles ignore RLS policies. */
  roleCanBypassRls: boolean
  isProduction: boolean
}

interface RlsGuardVerdict {
  level: 'ok' | 'warn' | 'error'
  message?: string
}

/**
 * Decides whether the runtime can enforce Row-Level Security, and how strictly to react.
 *
 * Tenant isolation relies on RLS, which PostgreSQL superusers and `BYPASSRLS` roles ignore
 * even under `FORCE ROW LEVEL SECURITY`. When the runtime cannot enforce RLS we fail closed
 * in production (refuse to boot) and warn in development (so local single-role setups keep working).
 */
export function evaluateRlsGuard({ runtimeUrlSet, roleCanBypassRls, isProduction }: RlsGuardInput): RlsGuardVerdict {
  if (runtimeUrlSet && !roleCanBypassRls) {
    return { level: 'ok' }
  }

  const cause = roleCanBypassRls
    ? 'the runtime database role is a superuser or has BYPASSRLS'
    : 'DB_RUNTIME_URL is not set (the runtime connects as the superuser DB_URL role)'

  const message =
    `Row-Level Security cannot be enforced: ${cause}. ` +
    'Set DB_RUNTIME_URL to a non-superuser role (e.g. unitae_app). ' +
    'See docs/development/row-level-security.md.'

  return { level: isProduction ? 'error' : 'warn', message }
}

interface RlsProbeClient {
  $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<{ can_bypass: boolean }[]>
}

/**
 * Probes the connected database role at boot and enforces {@link evaluateRlsGuard}'s verdict.
 *
 * In production a bypass-capable role (or a failed/empty probe) throws, so the process crashes
 * and fails closed rather than running with tenant isolation silently disabled.
 */
export async function assertRuntimeRoleEnforcesRls(client: RlsProbeClient = unscopedDb): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production'
  const runtimeUrlSet = Boolean(process.env.DB_RUNTIME_URL)

  const roleCanBypassRls = await probeRoleCanBypassRls(client, isProduction)

  const verdict = evaluateRlsGuard({ runtimeUrlSet, roleCanBypassRls, isProduction })

  if (verdict.level === 'error') {
    throw new Error(verdict.message)
  }
  if (verdict.level === 'warn') {
    logger.warn(verdict.message)
  }
}

async function probeRoleCanBypassRls(client: RlsProbeClient, isProduction: boolean): Promise<boolean> {
  try {
    const rows = await client.$queryRaw`
      SELECT (rolsuper OR rolbypassrls) AS can_bypass FROM pg_roles WHERE rolname = current_user
    `
    // Fail closed: an unexpected/empty result means we cannot prove RLS is enforced.
    return rows[0]?.can_bypass ?? true
  } catch (error) {
    if (isProduction) {
      throw new Error(
        'Row-Level Security cannot be verified: the database role probe failed. ' +
          'Refusing to start. See docs/development/row-level-security.md.',
        { cause: error },
      )
    }
    logger.warn('Could not verify the runtime database role can enforce RLS; assuming it cannot.')
    return true
  }
}
