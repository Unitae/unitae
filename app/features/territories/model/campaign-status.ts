export type CampaignStatus = 'scheduled' | 'active' | 'ended'

/**
 * Lifecycle status derived from the job's bookkeeping stamps, never from the
 * clock — a campaign whose endDate passed but whose sweep has not run yet is
 * still `active` (campaign mode stays on until the transition actually runs).
 */
export function getCampaignStatus(campaign: { activatedAt: Date | null; endedAt: Date | null }): CampaignStatus {
  if (campaign.endedAt != null) return 'ended'
  if (campaign.activatedAt != null) return 'active'
  return 'scheduled'
}
