import { unscopedDb } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'

interface RlsGuardInput {
  /** Whether `DB_RUNTIME_URL` is set — when unset, the runtime falls back to the superuser `DB_URL`. */
  runtimeUrlSet: boolean
  /** Whether the connected role is a superuser or has `BYPASSRLS` — such roles ignore RLS policies. */
  roleCanBypassRls: boolean
  /** Fail closed (throw) when true; only explicit development/test environments pass false. */
  isProduction: boolean
}

/**
 * `message` is present exactly when action is required (`warn`/`error`) and absent for `ok`,
 * so callers can throw/log `message` without a `| undefined` check.
 */
type RlsGuardVerdict = { level: 'ok' } | { level: 'warn' | 'error'; message: string }

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
  // The row shape must track the `can_bypass` alias in the probe SQL below.
  $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<{ can_bypass: boolean }[]>
}

/**
 * Probes the connected database role at boot and enforces {@link evaluateRlsGuard}'s verdict.
 *
 * Fails closed by default: any environment other than an explicit `development`/`test` is treated
 * as production, so an unset or misspelled `NODE_ENV` refuses to boot rather than silently
 * downgrading tenant isolation to a warning.
 */
export async function assertRuntimeRoleEnforcesRls(client: RlsProbeClient = unscopedDb): Promise<void> {
  const isProduction = !['development', 'test'].includes(process.env.NODE_ENV ?? '')
  const runtimeUrlSet = Boolean(process.env.DB_RUNTIME_URL)

  let roleCanBypassRls: boolean
  try {
    const rows = await client.$queryRaw`
      SELECT (rolsuper OR rolbypassrls) AS can_bypass FROM pg_roles WHERE rolname = current_user
    `
    // Fail closed: an unexpected/empty result means we cannot prove RLS is enforced.
    roleCanBypassRls = rows[0]?.can_bypass ?? true
  } catch (error) {
    // The probe itself failed — we cannot prove RLS is enforced. Report this cause directly
    // (rather than routing through evaluateRlsGuard, which would misattribute it to the role).
    const message =
      'Row-Level Security cannot be verified: the database role probe failed. ' +
      'See docs/development/row-level-security.md.'
    if (isProduction) {
      throw new Error(message, { cause: error })
    }
    logger.warn(message)
    return
  }

  const verdict = evaluateRlsGuard({ runtimeUrlSet, roleCanBypassRls, isProduction })

  if (verdict.level === 'error') {
    throw new Error(verdict.message)
  }
  if (verdict.level === 'warn') {
    logger.warn(verdict.message)
  }
}
