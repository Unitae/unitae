import type { TransactionClient } from '~/shared/infra/db.server'

const FIRST_MONTH_OF_THEOCRATIC_YEAR = 8

export async function listTheocraticYearsWithActivity(
  db: TransactionClient,
  congregationId: number,
): Promise<number[]> {
  const rows = await db.publisherActivity.groupBy({
    by: ['year', 'month'],
    where: { congregationId },
  })

  const theocraticYears = new Set<number>()
  for (const row of rows) {
    theocraticYears.add(row.month >= FIRST_MONTH_OF_THEOCRATIC_YEAR ? row.year : row.year - 1)
  }

  return [...theocraticYears].sort((a, b) => b - a)
}
