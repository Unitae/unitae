import type { TransactionClient } from '~/shared/infra/db.server'

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
