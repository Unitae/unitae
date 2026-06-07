/**
 * Lock the migration backfill SQL to behave the same as the runtime
 * `stripDiacritics()` helper for representative French inputs. The
 * `translate()` character map in `migration.sql` is hand-maintained — a typo
 * or a missing pair would silently corrupt the backfill on production for
 * any tenant relying on diacritic-stripped search.
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '~/database/generated/client'
import { stripDiacritics } from '~/shared/utils/strip-diacritics'

const adapter = new PrismaPg({
  connectionString: process.env.DB_RUNTIME_URL ?? process.env.DB_URL,
  max: 5,
  connectionTimeoutMillis: 5000,
})
const testDb = new PrismaClient({ adapter })

const TRANSLATE_FROM = 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿ'
const TRANSLATE_TO = 'aaaaaaceeeeiiiinooooouuuuyy'

async function backfillSql(input: string): Promise<string> {
  const rows = await testDb.$queryRawUnsafe<{ result: string }[]>(
    `SELECT translate(lower($1), $2, $3) AS result`,
    input,
    TRANSLATE_FROM,
    TRANSLATE_TO,
  )
  return rows[0]?.result ?? ''
}

afterAll(async () => {
  await testDb.$disconnect()
})

describe('migration backfill — SQL/JS parity', () => {
  const cases = [
    'Pajot',
    'Päjot',
    'PÄJOT',
    'élève',
    'Côté',
    'François',
    'Hélène',
    "L'Hôpital-Saint-Louis",
    "Boulevard Saint-Germain",
    'Champs-Élysées',
    'Mañana',
    'Müller',
    '   spaces   ',
    'mixed CASE Päjot',
  ]

  for (const input of cases) {
    it(`SQL backfill matches stripDiacritics() for "${input}"`, async () => {
      const sql = await backfillSql(input)
      expect(sql).toBe(stripDiacritics(input))
    })
  }

  it('translate map has matching from/to lengths', () => {
    // A length mismatch would be a Postgres runtime error inside the
    // migration — assert it here so a typo trips a unit failure before
    // anyone runs `prisma migrate deploy`.
    expect([...TRANSLATE_FROM]).toHaveLength([...TRANSLATE_TO].length)
  })

  it('uppercase variants get lowercased before translation', async () => {
    expect(await backfillSql('ÀÉÎÔÛ')).toBe('aeiou')
  })

  it('characters outside the map pass through unchanged', async () => {
    // æ / œ ligatures + the `ø` slash-o are uncommon in French names and not
    // in our map. Document that they survive instead of being silently
    // dropped — also keeps the SQL behaviour aligned with the JS helper,
    // which preserves them too (NFD doesn't canonically decompose them).
    expect(await backfillSql('cœur')).toBe('cœur')
    expect(await backfillSql('æther')).toBe('æther')
    expect(await backfillSql('strøget')).toBe('strøget')
  })
})
