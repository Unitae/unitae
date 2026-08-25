import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import type { TransactionClient } from '~/shared/infra/db.server'

const PREFIX: Record<TerritoryKindKey, string> = {
  [TerritoryKindKey.Classical]: 'D',
  [TerritoryKindKey.Hotel]: 'H',
  [TerritoryKindKey.Univ]: 'U',
  [TerritoryKindKey.Commerces]: 'C',
  [TerritoryKindKey.Phone]: 'P',
}

export async function computeNextTerritoryNumber(
  db: TransactionClient,
  congregationId: number,
  kind: TerritoryKindKey,
): Promise<string> {
  const count = await db.territory.count({ where: { type: kind, congregationId } })
  return `${PREFIX[kind]}${String(count + 1).padStart(3, '0')}`
}
