import { ConflictError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'

/**
 * Two territories of a congregation never share a number, whatever its case (« t13 » is « T13 »). `exceptId` leaves
 * the territory being renamed out of the search.
 */
export async function assertTerritoryNumberFree(
  db: TransactionClient,
  congregationId: number,
  number: string,
  exceptId?: number,
): Promise<void> {
  const clash = await db.territory.findFirst({
    where: {
      congregationId,
      number: { equals: number, mode: 'insensitive' },
      ...(exceptId != null ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  })
  if (clash != null) throw new ConflictError('territory_number_taken')
}
