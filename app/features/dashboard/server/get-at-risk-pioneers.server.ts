// Intentional cross-feature import: the dashboard aggregates pioneer risk for the overview.
import { toServiceYear } from '~/features/publishers'
import { getPioneerActivitySummary } from '~/features/publishers/index.server'
import type { TransactionClient } from '~/shared/infra/db.server'

const DASHBOARD_AT_RISK_LIMIT = 5

export interface AtRiskPioneer {
  memberId: number
  firstname: string
  lastname: string
  deficit: number
}
export interface AtRiskPioneers {
  count: number
  pioneers: AtRiskPioneer[]
}

export async function getAtRiskPioneers(
  db: TransactionClient,
  congregationId: number,
  now: Date,
): Promise<AtRiskPioneers> {
  const serviceYear = toServiceYear(now.getMonth(), now.getFullYear())
  const summary = await getPioneerActivitySummary(db, congregationId, serviceYear, now)

  const red = summary.annual.filter(row => !row.concluded && row.pace.riskBucket === 'red')
  return {
    count: red.length,
    pioneers: red.slice(0, DASHBOARD_AT_RISK_LIMIT).map(row => ({
      memberId: row.memberId,
      firstname: row.firstname,
      lastname: row.lastname,
      deficit: Math.abs(row.pace.paceDelta),
    })),
  }
}
