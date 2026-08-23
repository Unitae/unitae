import { TWO_WEEKS_MS } from '~/shared/constants/limits'
import type { TransactionClient } from '~/shared/infra/db.server'

export type TerritoryStatus = 'on-time' | 'due-soon' | 'overdue'

export function computeStatus(lateDate: Date): TerritoryStatus {
  const now = new Date()
  if (lateDate < now) return 'overdue'
  if (lateDate.getTime() - now.getTime() <= TWO_WEEKS_MS) return 'due-soon'
  return 'on-time'
}

// `memberId` — Attribution.publisherId is a Member FK, never pass a UserAccount id.
// Paused attributions are hidden by default — the territory left the
// publisher's working list for the campaign; `includePaused` reveals them
// (with `pausedAt` set) so the list can explain why.
export async function getUserTerritoriesWithDetails(
  db: TransactionClient,
  memberId: number,
  options: { includePaused?: boolean } = {},
) {
  const attributions = await db.attribution.findMany({
    where: {
      publisherId: memberId,
      endDate: null,
      ...(options.includePaused ? {} : { pausedAt: null }),
    },
    select: {
      id: true,
      startDate: true,
      lateDate: true,
      type: true,
      pausedAt: true,
      campaign: { select: { name: true } },
      territory: {
        select: {
          id: true,
          number: true,
          type: true,
          entrances: {
            select: {
              id: true,
              homes: true,
              phones: true,
              kind: true,
              shopKind: true,
            },
          },
        },
      },
    },
    orderBy: { lateDate: 'asc' },
  })

  return attributions.map(a => ({
    ...a,
    status: computeStatus(a.lateDate),
  }))
}

export async function getUserTerritoryDetail(db: TransactionClient, memberId: number, territoryId: number) {
  const attribution = await db.attribution.findFirst({
    where: {
      publisherId: memberId,
      endDate: null,
      territoryId,
    },
    select: {
      id: true,
      startDate: true,
      lateDate: true,
      type: true,
      pausedAt: true,
      campaign: { select: { name: true } },
      territory: {
        select: {
          id: true,
          number: true,
          type: true,
          notes: true,
          entrances: {
            include: {
              accesses: { orderBy: { position: 'asc' } },
              buildings: { where: { active: true } },
            },
          },
        },
      },
    },
  })

  return attribution
}
