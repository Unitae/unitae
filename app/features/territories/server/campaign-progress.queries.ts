import type { TransactionClient } from '~/shared/infra/db.server'

/** Territories of a campaign's scope attributed at least once for it, over the size of its scope. */
export interface CampaignCoverage {
  worked: number
  total: number
}

/**
 * The campaigns' coverage at once, for the list: the territories of its scope attributed at least once for it, over
 * its scope — every territory of the congregation when it names none. Each campaign asked for gets an answer.
 */
export async function listCampaignCoverage(
  db: TransactionClient,
  congregationId: number,
  campaignIds: number[],
): Promise<Record<number, CampaignCoverage>> {
  const [scopeRows, worked, territoryCount] = await Promise.all([
    db.campaignTerritory.findMany({ where: { congregationId }, select: { campaignId: true, territoryId: true } }),
    db.attribution.findMany({
      where: { congregationId, campaignId: { not: null } },
      select: { campaignId: true, territoryId: true },
    }),
    db.territory.count({ where: { congregationId } }),
  ])
  const scopes = new Map<number, Set<number>>()
  for (const row of scopeRows)
    scopes.set(row.campaignId, (scopes.get(row.campaignId) ?? new Set()).add(row.territoryId))

  const touched = new Map<number, Set<number>>()
  for (const row of worked) {
    if (row.campaignId == null) continue
    const scope = scopes.get(row.campaignId)
    if (scope != null && !scope.has(row.territoryId)) continue
    touched.set(row.campaignId, (touched.get(row.campaignId) ?? new Set()).add(row.territoryId))
  }

  const coverage: Record<number, CampaignCoverage> = {}
  for (const campaignId of campaignIds) {
    coverage[campaignId] = {
      worked: touched.get(campaignId)?.size ?? 0,
      total: scopes.get(campaignId)?.size ?? territoryCount,
    }
  }
  return coverage
}

const byNumber = new Intl.Collator(undefined, { numeric: true })

/**
 * What a campaign's page shows of its progress: the territories of its scope (every territory when it names none) in
 * number order, its attributions, and how many regular attributions it keeps paused.
 */
export async function getCampaignProgress(
  db: TransactionClient,
  campaign: { id: number; scope: { territoryId: number }[] },
  congregationId: number,
) {
  const scopeIds = campaign.scope.map(row => row.territoryId)
  const [territories, attributions, pausedCount] = await Promise.all([
    db.territory.findMany({
      where: { congregationId, ...(scopeIds.length > 0 ? { id: { in: scopeIds } } : {}) },
      select: { id: true, number: true, type: true },
    }),
    db.attribution.findMany({
      where: { campaignId: campaign.id, congregationId },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        territory: { select: { id: true, number: true, type: true } },
        publisher: { select: { id: true, firstname: true, lastname: true } },
      },
      orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
    }),
    db.attribution.count({ where: { congregationId, pausedByCampaignId: campaign.id, pausedAt: { not: null } } }),
  ])
  return {
    territories: [...territories].sort((a, b) => byNumber.compare(a.number, b.number)),
    attributions,
    pausedCount,
  }
}

/** The attributions pointing at a campaign, as its own or as ones it paused: while there is one, it cannot go. */
export function countCampaignReferences(db: TransactionClient, campaignId: number, congregationId: number) {
  return db.attribution.count({
    where: { congregationId, OR: [{ campaignId }, { pausedByCampaignId: campaignId }] },
  })
}
