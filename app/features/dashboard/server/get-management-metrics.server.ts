import type { TransactionClient } from '~/shared/infra/db.server'

/** `null` blocks mean "not requested for this caller's permissions", never an error. */
export interface ManagementMetrics {
  territories: { total: number; assigned: number; late: number } | null
  publishers: { total: number } | null
}

interface ManagementMetricsOptions {
  includeTerritories: boolean
  includePublishers: boolean
}

/**
 * Congregation-wide counters for the dashboard metrics row, gated per
 * permission so a member never pays for (or sees) numbers they can't act on.
 * Runs inside `withScope`, so RLS bounds every count to the congregation.
 */
export async function getManagementMetrics(
  db: TransactionClient,
  now: Date,
  options: ManagementMetricsOptions,
): Promise<ManagementMetrics> {
  const [territoryCounts, publisherCount] = await Promise.all([
    options.includeTerritories
      ? Promise.all([
          db.territory.count(),
          db.attribution.count({ where: { endDate: null } }),
          db.attribution.count({ where: { endDate: null, lateDate: { lt: now } } }),
        ])
      : Promise.resolve(null),
    options.includePublishers ? db.member.count({ where: { isPublisher: true, leftAt: null } }) : Promise.resolve(null),
  ])

  return {
    territories: territoryCounts
      ? { total: territoryCounts[0], assigned: territoryCounts[1], late: territoryCounts[2] }
      : null,
    publishers: publisherCount != null ? { total: publisherCount } : null,
  }
}
