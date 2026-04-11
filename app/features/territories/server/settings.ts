import type { TransactionClient } from '~/shared/libs/db.server'

export function parseTerritoryPolygon(text: string): [number, number][] {
  return text.split(',').map(coord =>
    coord
      .trim()
      .split(' ')
      .filter(el => el != null && el !== ' ')
      .map(Number),
  ) as [number, number][]
}

export function serializeTerritoryPolygon(polygon: [number, number][]) {
  return polygon.map(coord => coord.join(' ')).join(',')
}

export function parseZips(text: string): string[] {
  return text.split(',').map(el => el.trim())
}

export function serializeZips(zips: string[]) {
  return zips.join(', ')
}

export async function getAllowedZips(db: TransactionClient): Promise<string[]> {
  const zips = await db.setting.findFirst({
    where: { key: 'zips' },
  })

  if (!zips) {
    return []
  }

  return JSON.parse(zips?.value ?? '')
}
