import { billingEntryUrl } from './billing-link.server'
import type { CongregationInfo } from './congregation.server'
import { type TrialBannerInfo, trialStatus } from './trial-status'

type TrialCongregation = Pick<CongregationInfo, 'trialEndsAt' | 'timezone' | 'stripeCustomerId' | 'slug'>

// What the authenticated layout shows about the congregation's trial, or null outside one. The
// subscription link follows the settings hub: only members who configure the congregation get it,
// and it is null when the instance has no managed billing.
export function getTrialBanner(
  congregation: TrialCongregation,
  options: { canSubscribe: boolean; locale: string; now: Date },
): TrialBannerInfo | null {
  const status = trialStatus(congregation.trialEndsAt, options.now)
  if (status == null || congregation.trialEndsAt == null) return null

  return {
    ...status,
    endsOn: new Intl.DateTimeFormat(options.locale, {
      day: 'numeric',
      month: 'long',
      timeZone: congregation.timezone,
    }).format(congregation.trialEndsAt),
    subscribeUrl: billingEntryUrl({
      isAdmin: options.canSubscribe,
      stripeCustomerId: congregation.stripeCustomerId,
      slug: congregation.slug,
    }),
  }
}
