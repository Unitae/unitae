// Safety rail for the integration suite.
//
// Integration tests write into, and in places truncate, whatever database DB_URL names. Nothing
// stopped that being a development database, and pointing it at one is how a working dev
// database ends up holding a pile of leftover `Roles Other 1788220863373` fixtures — which then
// surface in the app itself, because single-tenant mode assumes one congregation row.
//
// The control plane has carried the same rail for a while; this is the main app catching up.
// CI already names its database `unitae_test`, so nothing there changes.

// Anchored on the delimiters rather than a bare substring: `latest` and `greatest` contain the
// letters without being test databases.
const TEST_DB_NAME = /(^|[_-])test([_-]|$)/i

export function isTestDatabaseName(name: string): boolean {
  return TEST_DB_NAME.test(name)
}

const LEADING_SLASH = /^\//

function databaseName(url: string, varName: string): string {
  try {
    return new URL(url).pathname.replace(LEADING_SLASH, '')
  } catch {
    throw new Error(`Refusing to run integration tests: ${varName} is not a valid URL (${url}).`)
  }
}

/**
 * Throws unless `url` names a disposable test database.
 *
 * Takes the URL rather than reading `process.env` so the rule is testable without mutating the
 * environment, and so the failure message can name what it actually saw.
 */
export function assertTestDatabase(url: string | undefined, varName = 'DB_URL'): void {
  if (!url) {
    throw new Error(`Refusing to run integration tests: ${varName} is not set. Point it at a test database.`)
  }

  const name = databaseName(url, varName)
  if (!isTestDatabaseName(name)) {
    throw new Error(
      `Refusing to run integration tests: they truncate data, and the ${varName} database name must carry a "test" ` +
        `token (got "${name}"). Point ${varName} at a disposable test database, e.g. unitae_test.`,
    )
  }
}

/**
 * Throws unless every database the integration suite can reach is a disposable test one.
 *
 * DB_URL alone is not the whole story: most integration files build their Prisma client from
 * `DB_RUNTIME_URL ?? DB_URL` so that RLS is exercised as the non-superuser role, and the
 * migration suites use DB_URL because a migration runs as the schema owner. A runtime URL left
 * pointing at a development database therefore sends nearly every write there while DB_URL looks
 * entirely safe — which is precisely how a working database ends up full of test fixtures.
 */
export function assertIntegrationDatabases(env: { dbUrl?: string; runtimeUrl?: string }): void {
  assertTestDatabase(env.dbUrl, 'DB_URL')

  if (!env.runtimeUrl) return
  assertTestDatabase(env.runtimeUrl, 'DB_RUNTIME_URL')

  // Both are test databases but not the SAME one: the suite would split its writes across two
  // and tear down only one, leaving the other to accumulate exactly the rows this guard exists
  // to prevent.
  const primary = databaseName(env.dbUrl as string, 'DB_URL')
  const runtime = databaseName(env.runtimeUrl, 'DB_RUNTIME_URL')
  if (primary !== runtime) {
    throw new Error(
      `Refusing to run integration tests: DB_URL and DB_RUNTIME_URL must point at the same database ` +
        `(got "${primary}" and "${runtime}").`,
    )
  }
}
