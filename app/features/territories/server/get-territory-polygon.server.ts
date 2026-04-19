import type { TransactionClient } from '~/shared/infra/db.server'

export async function getTerritoryPolygon(db: TransactionClient): Promise<[number, number][]> {
  const territory = await db.setting.findFirst({
    where: { key: 'territory' },
  })

  if (!territory) {
    return []
  }

  return JSON.parse(territory?.value ?? '')
}
