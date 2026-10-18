// Where a SaaS congregation stands in its trial, for the banner the app shows during it. Pure.
// `trialEndsAt` is written by the control plane at registration and cleared when the congregation
// subscribes; once it has passed, the session guard redirects to /trial-expired instead.

const MS_PER_DAY = 86_400_000

// From this many days left, the banner turns into a warning.
export const TRIAL_ENDING_SOON_DAYS = 7

export interface TrialStatus {
  // Whole days left, a started day counting as one: 2 hours left reads as 1 day.
  daysLeft: number
  endingSoon: boolean
}

export function trialStatus(trialEndsAt: Date | null, now: Date): TrialStatus | null {
  if (trialEndsAt == null || trialEndsAt <= now) return null
  const daysLeft = Math.ceil((trialEndsAt.getTime() - now.getTime()) / MS_PER_DAY)
  return { daysLeft, endingSoon: daysLeft <= TRIAL_ENDING_SOON_DAYS }
}

// What the app shell's trial banner shows.
export interface TrialBannerInfo extends TrialStatus {
  // The trial's last day, already formatted in the congregation's time zone.
  endsOn: string
  // Checkout for members who can configure the congregation; null for everyone else, and when the
  // instance has no managed billing configured.
  subscribeUrl: string | null
}
