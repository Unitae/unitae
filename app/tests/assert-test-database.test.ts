import { describe, expect, it } from 'vitest'
import { assertIntegrationDatabases, assertTestDatabase, isTestDatabaseName } from './assert-test-database'

// The integration suite writes into, and in places truncates, whatever database DB_URL names.
// Nothing stopped it being pointed at a development database, and pointing it at one is how a
// working dev database ends up holding a pile of `Roles Other 1788220863373` fixtures.
describe('isTestDatabaseName', () => {
  it('accepts the name CI uses', () => {
    expect(isTestDatabaseName('unitae_test')).toBe(true)
  })

  it.each(['test', 'test_unitae', 'unitae-test', 'unitae_test_2', 'my-test-db'])('accepts %s', name => {
    expect(isTestDatabaseName(name)).toBe(true)
  })

  it('refuses the development database', () => {
    expect(isTestDatabaseName('unitae_dev')).toBe(false)
  })

  it.each(['unitae', 'production', 'unitae_prod'])('refuses %s', name => {
    expect(isTestDatabaseName(name)).toBe(false)
  })

  // Anchored on purpose: a bare substring match would wave through anything merely containing
  // the letters, and `latest` is a plausible database name.
  it.each(['latest', 'greatest', 'contest', 'testing'])('refuses %s — token must be delimited', name => {
    expect(isTestDatabaseName(name)).toBe(false)
  })
})

describe('assertTestDatabase', () => {
  it('passes for a test database', () => {
    expect(() => assertTestDatabase('postgresql://u:p@localhost:5432/unitae_test')).not.toThrow()
  })

  it('names the offending database so the fix is obvious', () => {
    expect(() => assertTestDatabase('postgresql://u:p@localhost:5432/unitae_dev')).toThrow('unitae_dev')
  })

  it('refuses rather than silently allowing an unset DB_URL', () => {
    expect(() => assertTestDatabase(undefined)).toThrow()
  })

  it('refuses a URL it cannot parse', () => {
    expect(() => assertTestDatabase('not a url')).toThrow()
  })
})

// Guarding DB_URL alone is not enough: most integration files build their client from
// `DB_RUNTIME_URL ?? DB_URL`, so a runtime URL left pointing at a development database sends
// every write there while DB_URL looks perfectly safe. That combination is exactly how a dev
// database gets polluted without anyone doing anything obviously wrong.
describe('assertIntegrationDatabases', () => {
  const testUrl = 'postgresql://unitae:unitae@localhost:5432/unitae_test'
  const devUrl = 'postgresql://unitae_app:unitae_app@localhost:5432/unitae_dev'

  it('passes when only DB_URL is set and names a test database', () => {
    expect(() => assertIntegrationDatabases({ dbUrl: testUrl })).not.toThrow()
  })

  it('passes when both name the same test database', () => {
    expect(() =>
      assertIntegrationDatabases({
        dbUrl: testUrl,
        runtimeUrl: 'postgresql://unitae_app:unitae_app@localhost:5432/unitae_test',
      }),
    ).not.toThrow()
  })

  it('refuses a runtime URL pointing at a development database', () => {
    expect(() => assertIntegrationDatabases({ dbUrl: testUrl, runtimeUrl: devUrl })).toThrow('DB_RUNTIME_URL')
  })

  it('names the offending database in the runtime case too', () => {
    expect(() => assertIntegrationDatabases({ dbUrl: testUrl, runtimeUrl: devUrl })).toThrow('unitae_dev')
  })

  // Both carry a "test" token, so neither trips the name check on its own — but the suite would
  // split its writes across two databases and clean up only one of them.
  it('refuses two different test databases', () => {
    expect(() =>
      assertIntegrationDatabases({
        dbUrl: testUrl,
        runtimeUrl: 'postgresql://unitae_app:unitae_app@localhost:5432/other_test',
      }),
    ).toThrow('same database')
  })

  it('still refuses a bad DB_URL', () => {
    expect(() => assertIntegrationDatabases({ dbUrl: devUrl })).toThrow('DB_URL')
  })
})
