import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import type { TransactionClient } from '~/shared/infra/db.server'

const PREFIX: Record<TerritoryKind, string> = {
  [TerritoryKind.Classical]: 'D',
  [TerritoryKind.Hotel]: 'H',
  [TerritoryKind.Univ]: 'U',
  [TerritoryKind.Commerces]: 'C',
  [TerritoryKind.Phone]: 'P',
}

export async function computeNextTerritoryNumber(
  db: TransactionClient,
  congregationId: number,
  kind: TerritoryKind,
): Promise<string> {
  const count = await db.territory.count({ where: { type: kind, congregationId } })
  return `${PREFIX[kind]}${String(count + 1).padStart(3, '0')}`
}
