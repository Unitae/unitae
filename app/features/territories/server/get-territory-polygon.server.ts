import type { ScopedDb } from '~/shared/libs/db.server'

export async function getTerritoryPolygon(db: ScopedDb): Promise<[number, number][]> {
  const territory = await db.setting.findFirst({
    where: { key: 'territory' },
  })

  if (!territory) {
    return []
  }

  return JSON.parse(territory?.value ?? '')
}
